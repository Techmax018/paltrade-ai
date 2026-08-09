/**
 * src/lib/backtestEngine.ts
 *
 * Deterministic backtest runner that replays the SAME strategy signals used by
 * the live terminal (analyzeMarket + confluence/confidence gates from the
 * autonomous engine) over a historical candle series.
 *
 * Pure functions only — no network, no React. Safe to call from a component.
 */
import { analyzeMarket, type Analysis } from "./analysis";
import type { Candle, DerivSymbol, Timeframe } from "./derivApi";
import { TIMEFRAME_SECONDS } from "./derivApi";

export interface BacktestOptions {
  /** Minimum analysis confidence (%) required to open a trade. */
  minConfidence: number;
  /** Require full confluence alignment (same gate as Auto-Pilot). */
  requireConfluence: boolean;
  /** Which take-profit target to use: 0 = TP1, 1 = TP2, 2 = TP3. */
  targetIndex: 0 | 1 | 2;
  /** % of equity risked per trade. */
  riskPct: number;
  /** Starting balance in account currency. */
  startingBalance: number;
  /** Evaluate a signal every N candles (1 = every candle). */
  step: number;
}

export const DEFAULT_BACKTEST_OPTIONS: BacktestOptions = {
  minConfidence: 70,
  requireConfluence: false,
  targetIndex: 1,
  riskPct: 1,
  startingBalance: 10_000,
  step: 1,
};

export interface BacktestTrade {
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  target: number;
  exit: number;
  entryTime: number;
  exitTime: number;
  rMultiple: number;
  pnl: number;
  confidence: number;
  strategy: string;
  outcome: "WIN" | "LOSS" | "OPEN";
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: { t: number; equity: number }[];
  stats: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnl: number;
    returnPct: number;
    profitFactor: number;
    expectancyR: number;
    maxDrawdownPct: number;
    avgWin: number;
    avgLoss: number;
    barsTested: number;
  };
}

const WARMUP = 210; // enough history for EMA200 / swing detection

/** Number of candles needed to cover a date range on a timeframe. */
export function barsForRange(from: number, to: number, timeframe: Timeframe): number {
  const secs = TIMEFRAME_SECONDS[timeframe];
  return Math.max(1, Math.ceil((to - from) / 1000 / secs));
}

/** Filter a candle series down to a [from, to] epoch-ms window. */
export function sliceRange(candles: Candle[], from: number, to: number): Candle[] {
  return candles.filter((c) => {
    const t = c.time > 1e12 ? c.time : c.time * 1000;
    return t >= from && t <= to;
  });
}

function candleTimeMs(c: Candle): number {
  return c.time > 1e12 ? c.time : c.time * 1000;
}

export function runStrategyBacktest(
  candles: Candle[],
  symbol: DerivSymbol,
  opts: BacktestOptions,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const equityCurve: { t: number; equity: number }[] = [];
  let equity = opts.startingBalance;
  let peak = equity;
  let maxDD = 0;

  if (candles.length <= WARMUP + 5) {
    return {
      trades,
      equityCurve,
      stats: {
        trades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, returnPct: 0,
        profitFactor: 0, expectancyR: 0, maxDrawdownPct: 0, avgWin: 0, avgLoss: 0,
        barsTested: Math.max(0, candles.length - WARMUP),
      },
    };
  }

  const step = Math.max(1, Math.floor(opts.step));
  let i = WARMUP;

  while (i < candles.length - 1) {
    const window = candles.slice(0, i + 1);
    const price = window[window.length - 1].close;
    let analysis: Analysis;
    try {
      analysis = analyzeMarket(window, price);
    } catch {
      i += step;
      continue;
    }

    const passes =
      analysis.bias !== "NEUTRAL" &&
      analysis.confidence >= opts.minConfidence &&
      (!opts.requireConfluence || analysis.confluenceAligned);

    if (!passes) {
      i += step;
      continue;
    }

    const side: "BUY" | "SELL" = analysis.bias === "BULLISH" ? "BUY" : "SELL";
    const entry = price;
    const stop = analysis.suggestedStop;
    const target = analysis.targets[opts.targetIndex];
    const risk = Math.abs(entry - stop);
    if (risk <= 0) { i += step; continue; }

    // Walk forward until SL or TP is touched.
    let exit = entry;
    let exitIdx = candles.length - 1;
    let outcome: BacktestTrade["outcome"] = "OPEN";

    for (let j = i + 1; j < candles.length; j++) {
      const c = candles[j];
      const hitStop = side === "BUY" ? c.low <= stop : c.high >= stop;
      const hitTarget = side === "BUY" ? c.high >= target : c.low <= target;
      // Conservative: if both touched in the same candle, assume stop first.
      if (hitStop) { exit = stop; exitIdx = j; outcome = "LOSS"; break; }
      if (hitTarget) { exit = target; exitIdx = j; outcome = "WIN"; break; }
    }
    if (outcome === "OPEN") {
      exit = candles[candles.length - 1].close;
      exitIdx = candles.length - 1;
    }

    const rMultiple = (side === "BUY" ? exit - entry : entry - exit) / risk;
    const riskAmount = equity * (opts.riskPct / 100);
    const pnl = riskAmount * rMultiple;
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, (equity - peak) / peak);

    trades.push({
      side, entry, stop, target, exit,
      entryTime: candleTimeMs(candles[i]),
      exitTime: candleTimeMs(candles[exitIdx]),
      rMultiple,
      pnl,
      confidence: analysis.confidence,
      strategy: analysis.strategy,
      outcome: outcome === "OPEN" ? (pnl >= 0 ? "WIN" : "LOSS") : outcome,
    });
    equityCurve.push({ t: candleTimeMs(candles[exitIdx]), equity });

    // No pyramiding — resume scanning after the trade closed.
    i = Math.max(exitIdx + 1, i + step);
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  return {
    trades,
    equityCurve: [{ t: candleTimeMs(candles[WARMUP]), equity: opts.startingBalance }, ...equityCurve],
    stats: {
      trades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      netPnl: equity - opts.startingBalance,
      returnPct: ((equity - opts.startingBalance) / opts.startingBalance) * 100,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      expectancyR: trades.length ? trades.reduce((a, t) => a + t.rMultiple, 0) / trades.length : 0,
      maxDrawdownPct: maxDD * 100,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      barsTested: candles.length - WARMUP,
    },
  };
}

/** Symbol pip helper kept here so the panel doesn't need derivApi maths. */
export function pipsBetween(a: number, b: number, symbol: DerivSymbol): number {
  return Math.abs(a - b) / symbol.pipSize;
}
