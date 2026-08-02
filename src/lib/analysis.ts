import type { Candle } from "./derivApi";
import { ema, rsi, fibRetracement } from "./derivApi";

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface Gap {
  from: number;
  to: number;
  kind: "bullish" | "bearish";
  index: number;
}

export interface Analysis {
  bias: Bias;
  confidence: number;
  rsi: number | null;
  ema50: number | null;
  ema200: number | null;
  support: number;
  resistance: number;
  gaps: Gap[];
  fib: ReturnType<typeof fibRetracement>;
  strategy: string;
  rationale: string[];
  suggestedEntry: number;
  suggestedStop: number;
  targets: [number, number, number];
}

/** Detect 3-candle fair value gaps (imbalances). */
export function findFairValueGaps(candles: Candle[], max = 3): Gap[] {
  const out: Gap[] = [];
  for (let i = candles.length - 2; i >= 2 && out.length < max; i--) {
    const a = candles[i - 2];
    const c = candles[i];
    if (a.high < c.low) out.push({ from: a.high, to: c.low, kind: "bullish", index: i });
    else if (a.low > c.high) out.push({ from: c.high, to: a.low, kind: "bearish", index: i });
  }
  return out;
}

export function analyzeMarket(candles: Candle[], price: number): Analysis {
  const closes = candles.map((c) => c.close);
  const e50 = ema(closes, 50).at(-1) ?? null;
  const e200 = ema(closes, 200).at(-1) ?? null;
  const r = rsi(closes, 14).at(-1) ?? null;
  const fib = fibRetracement(candles, 60);
  const recent = candles.slice(-60);
  const support = Math.min(...recent.map((c) => c.low));
  const resistance = Math.max(...recent.map((c) => c.high));
  const gaps = findFairValueGaps(candles);

  let score = 0;
  const rationale: string[] = [];

  if (e50 !== null && e200 !== null) {
    if (e50 > e200) {
      score += 2;
      rationale.push("50 EMA is above the 200 EMA — trend structure favours longs.");
    } else {
      score -= 2;
      rationale.push("50 EMA is below the 200 EMA — trend structure favours shorts.");
    }
  }
  if (e50 !== null) {
    if (price > e50) {
      score += 1;
      rationale.push("Price is trading above the 50 EMA (momentum intact).");
    } else {
      score -= 1;
      rationale.push("Price is trading below the 50 EMA (momentum fading).");
    }
  }
  if (r !== null) {
    if (r < 30) {
      score += 2;
      rationale.push(`RSI(14) at ${r.toFixed(1)} — oversold, mean-reversion pressure upward.`);
    } else if (r > 70) {
      score -= 2;
      rationale.push(`RSI(14) at ${r.toFixed(1)} — overbought, exhaustion risk.`);
    } else {
      rationale.push(`RSI(14) at ${r.toFixed(1)} — neutral momentum band.`);
    }
  }

  const golden = fib?.levels.find((l) => l.level === 0.618);
  const range = resistance - support || price * 0.001;
  if (golden && Math.abs(price - golden.price) < range * 0.06) {
    score += fib!.upTrend ? 2 : -2;
    rationale.push("Price is reacting inside the 61.8% golden zone — high-probability confluence.");
  }
  if (gaps.length) {
    rationale.push(`${gaps.length} unfilled fair value gap${gaps.length > 1 ? "s" : ""} detected — expect magnet behaviour.`);
    score += gaps[0].kind === "bullish" ? 1 : -1;
  }

  const bias: Bias = score >= 2 ? "BULLISH" : score <= -2 ? "BEARISH" : "NEUTRAL";
  const long = bias !== "BEARISH";

  const strategy =
    golden && Math.abs(price - golden.price) < range * 0.08
      ? `61.8% Golden Zone Retracement ${long ? "Buy" : "Sell"}`
      : r !== null && r < 30
        ? "Oversold RSI Reversal Buy"
        : r !== null && r > 70
          ? "Overbought RSI Reversal Sell"
          : e50 !== null && e200 !== null && e50 > e200
            ? "EMA Trend Continuation Buy on Pullback"
            : e50 !== null && e200 !== null && e50 < e200
              ? "EMA Trend Continuation Sell on Rally"
              : "Range Fade — wait for level rejection";

  const stopDistance = Math.max(range * 0.25, price * 0.0012);
  const suggestedStop = long ? price - stopDistance : price + stopDistance;
  const targets: [number, number, number] = long
    ? [price + stopDistance, price + stopDistance * 2, price + stopDistance * 3]
    : [price - stopDistance, price - stopDistance * 2, price - stopDistance * 3];

  return {
    bias,
    confidence: Math.min(95, 45 + Math.abs(score) * 9),
    rsi: r,
    ema50: e50,
    ema200: e200,
    support,
    resistance,
    gaps,
    fib,
    strategy,
    rationale,
    suggestedEntry: price,
    suggestedStop,
    targets,
  };
}
