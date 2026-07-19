import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LineChart, Play, TrendingUp, TrendingDown, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/backtest")({
  head: () => ({
    meta: [
      { title: "Backtest — PalTrade Strategy Lab" },
      { name: "description", content: "Test simple forex strategies (SMA crossover, RSI) on historical price data and see equity, win rate, and drawdown." },
    ],
  }),
  component: BacktestPage,
});

type Candle = { t: number; close: number };
type Trade = { entryIdx: number; exitIdx: number; entry: number; exit: number; pnl: number; side: "long" | "short" };

const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "XAU/USD"];

// Deterministic pseudo-random price series (seeded) so results are reproducible per input.
function seededPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function generateSeries(symbol: string, bars: number, seed: number): Candle[] {
  const rnd = seededPrng(seed + symbol.length * 31);
  const base = symbol === "USD/JPY" ? 150 : symbol === "XAU/USD" ? 2300 : 1.1;
  const vol = symbol === "USD/JPY" ? 0.6 : symbol === "XAU/USD" ? 6 : 0.004;
  let price = base;
  let drift = (rnd() - 0.5) * vol * 0.05;
  const out: Candle[] = [];
  const start = Date.now() - bars * 3600_000;
  for (let i = 0; i < bars; i++) {
    if (i % 30 === 0) drift = (rnd() - 0.5) * vol * 0.06;
    const shock = (rnd() - 0.5) * vol;
    price = Math.max(0.0001, price + drift + shock);
    out.push({ t: start + i * 3600_000, close: price });
  }
  return out;
}

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function rsi(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let gains = 0, losses = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) { out.push(null); continue; }
    const d = values[i] - values[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= period) {
      gains += g; losses += l;
      if (i === period) {
        const rs = losses === 0 ? 100 : gains / losses;
        out.push(100 - 100 / (1 + rs));
      } else out.push(null);
    } else {
      gains = (gains * (period - 1) + g) / period;
      losses = (losses * (period - 1) + l) / period;
      const rs = losses === 0 ? 100 : gains / losses;
      out.push(100 - 100 / (1 + rs));
    }
  }
  return out;
}

type Strategy = "sma" | "rsi";
type Params = {
  strategy: Strategy;
  symbol: string;
  bars: number;
  seed: number;
  fast: number;
  slow: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  riskPct: number;
  startingCapital: number;
};

function runBacktest(p: Params) {
  const candles = generateSeries(p.symbol, p.bars, p.seed);
  const closes = candles.map((c) => c.close);
  const trades: Trade[] = [];
  let position: { side: "long" | "short"; entry: number; entryIdx: number } | null = null;

  const fastMa = sma(closes, p.fast);
  const slowMa = sma(closes, p.slow);
  const rsiArr = rsi(closes, p.rsiPeriod);

  for (let i = 1; i < closes.length; i++) {
    let signal: "long" | "short" | "close" | null = null;

    if (p.strategy === "sma") {
      const f = fastMa[i], s = slowMa[i], pf = fastMa[i - 1], ps = slowMa[i - 1];
      if (f != null && s != null && pf != null && ps != null) {
        if (pf <= ps && f > s) signal = "long";
        else if (pf >= ps && f < s) signal = "short";
      }
    } else {
      const r = rsiArr[i], pr = rsiArr[i - 1];
      if (r != null && pr != null) {
        if (pr <= p.rsiOversold && r > p.rsiOversold) signal = "long";
        else if (pr >= p.rsiOverbought && r < p.rsiOverbought) signal = "short";
      }
    }

    if (signal === "long" || signal === "short") {
      if (position && position.side !== signal) {
        const pnl = position.side === "long" ? closes[i] - position.entry : position.entry - closes[i];
        trades.push({ entryIdx: position.entryIdx, exitIdx: i, entry: position.entry, exit: closes[i], pnl, side: position.side });
        position = null;
      }
      if (!position) position = { side: signal, entry: closes[i], entryIdx: i };
    }
  }
  if (position) {
    const last = closes.length - 1;
    const pnl = position.side === "long" ? closes[last] - position.entry : position.entry - closes[last];
    trades.push({ entryIdx: position.entryIdx, exitIdx: last, entry: position.entry, exit: closes[last], pnl, side: position.side });
  }

  // Equity curve: risk-based position sizing (each trade risks riskPct of current equity, scaled by move %).
  let equity = p.startingCapital;
  const equityCurve: number[] = [equity];
  let peak = equity, maxDD = 0, wins = 0;
  for (const t of trades) {
    const retPct = (t.pnl / t.entry) * 10; // leverage-ish scaling for demo
    const trade$ = equity * (p.riskPct / 100) * retPct;
    equity += trade$;
    if (t.pnl > 0) wins++;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, (equity - peak) / peak);
    equityCurve.push(equity);
  }

  return {
    candles, closes, trades, equityCurve,
    stats: {
      trades: trades.length,
      winRate: trades.length ? (wins / trades.length) * 100 : 0,
      endEquity: equity,
      returnPct: ((equity - p.startingCapital) / p.startingCapital) * 100,
      maxDDPct: maxDD * 100,
    },
  };
}

function BacktestPage() {
  const [params, setParams] = useState<Params>({
    strategy: "sma",
    symbol: "EUR/USD",
    bars: 500,
    seed: 42,
    fast: 10,
    slow: 30,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    riskPct: 1,
    startingCapital: 10000,
  });
  const [ran, setRan] = useState(false);
  const result = useMemo(() => runBacktest(params), [params]);
  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to PalTrade
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <LineChart className="h-4 w-4 text-primary" />
            <span className="font-semibold">Strategy Lab</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary">Backtesting</div>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Test forex rules on historical data</h1>
          <p className="mt-3 text-muted-foreground">
            Pick a strategy, tune the parameters, and see how it would have performed on a reproducible historical series.
            Great for building intuition before risking real capital.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
            <Field label="Strategy">
              <select
                value={params.strategy}
                onChange={(e) => set("strategy", e.target.value as Strategy)}
                className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="sma">SMA Crossover</option>
                <option value="rsi">RSI Reversal</option>
              </select>
            </Field>

            <Field label="Pair">
              <select
                value={params.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Bars (H1)"><NumInput value={params.bars} min={100} max={2000} step={50} onChange={(v) => set("bars", v)} /></Field>
              <Field label="Seed"><NumInput value={params.seed} min={1} max={9999} step={1} onChange={(v) => set("seed", v)} /></Field>
            </div>

            {params.strategy === "sma" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fast MA"><NumInput value={params.fast} min={2} max={100} step={1} onChange={(v) => set("fast", v)} /></Field>
                <Field label="Slow MA"><NumInput value={params.slow} min={5} max={300} step={1} onChange={(v) => set("slow", v)} /></Field>
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="RSI Period"><NumInput value={params.rsiPeriod} min={2} max={50} step={1} onChange={(v) => set("rsiPeriod", v)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Oversold"><NumInput value={params.rsiOversold} min={5} max={45} step={1} onChange={(v) => set("rsiOversold", v)} /></Field>
                  <Field label="Overbought"><NumInput value={params.rsiOverbought} min={55} max={95} step={1} onChange={(v) => set("rsiOverbought", v)} /></Field>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Risk %"><NumInput value={params.riskPct} min={0.1} max={5} step={0.1} onChange={(v) => set("riskPct", v)} /></Field>
              <Field label="Capital $"><NumInput value={params.startingCapital} min={100} max={1_000_000} step={100} onChange={(v) => set("startingCapital", v)} /></Field>
            </div>

            <button
              onClick={() => setRan(true)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
            >
              <Play className="h-4 w-4" /> Run backtest
            </button>
            <p className="text-xs text-muted-foreground">
              Uses a reproducible synthetic price series. Educational only — not a live signal.
            </p>
          </aside>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Trades" value={result.stats.trades.toString()} />
              <Stat label="Win rate" value={`${result.stats.winRate.toFixed(1)}%`} />
              <Stat label="Return" value={`${result.stats.returnPct >= 0 ? "+" : ""}${result.stats.returnPct.toFixed(2)}%`} tone={result.stats.returnPct >= 0 ? "bull" : "bear"} />
              <Stat label="Max DD" value={`${result.stats.maxDDPct.toFixed(2)}%`} tone="bear" />
            </div>

            <PriceEquityChart closes={result.closes} equity={result.equityCurve} trades={result.trades} />

            <div className="rounded-2xl border border-border bg-card shadow-card">
              <div className="border-b border-border/60 px-5 py-3 text-sm font-medium">Recent trades</div>
              <div className="max-h-72 overflow-y-auto">
                {result.trades.length === 0 && (
                  <div className="p-5 text-sm text-muted-foreground">No trades yet — adjust params and run.</div>
                )}
                {result.trades.slice(-20).reverse().map((t, i) => (
                  <div key={i} className="flex items-center justify-between border-t border-border/40 px-5 py-2 font-mono text-xs">
                    <span className={`inline-flex items-center gap-1 ${t.side === "long" ? "text-bull" : "text-bear"}`}>
                      {t.side === "long" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {t.side.toUpperCase()}
                    </span>
                    <span className="text-muted-foreground">@ {t.entry.toFixed(4)} → {t.exit.toFixed(4)}</span>
                    <span className={t.pnl >= 0 ? "text-bull" : "text-bear"}>
                      {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {!ran && (
              <p className="text-xs text-muted-foreground">Results update live as you change parameters.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function NumInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-md bg-input px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-xl font-semibold ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}

function PriceEquityChart({ closes, equity, trades }: { closes: number[]; equity: number[]; trades: Trade[] }) {
  const W = 800, H = 260, pad = 8;
  const minP = Math.min(...closes), maxP = Math.max(...closes);
  const minE = Math.min(...equity), maxE = Math.max(...equity);
  const px = (i: number, n: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
  const pyP = (v: number) => pad + (1 - (v - minP) / Math.max(1e-9, maxP - minP)) * (H - pad * 2);
  const pyE = (v: number) => pad + (1 - (v - minE) / Math.max(1e-9, maxE - minE)) * (H - pad * 2);
  const priceD = closes.map((v, i) => `${i === 0 ? "M" : "L"}${px(i, closes.length).toFixed(1)},${pyP(v).toFixed(1)}`).join(" ");
  const equityD = equity.map((v, i) => `${i === 0 ? "M" : "L"}${px(i, equity.length).toFixed(1)},${pyE(v).toFixed(1)}`).join(" ");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-muted-foreground"><span className="h-0.5 w-4 bg-muted-foreground" />Price</span>
          <span className="inline-flex items-center gap-1 text-primary"><span className="h-0.5 w-4 bg-primary" />Equity</span>
        </div>
        <span className="font-mono text-muted-foreground">{closes.length} bars · {trades.length} trades</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-64 w-full">
        <path d={priceD} fill="none" stroke="oklch(0.70 0.02 260)" strokeWidth="1.2" opacity="0.7" />
        {trades.map((t, i) => (
          <g key={i}>
            <circle cx={px(t.entryIdx, closes.length)} cy={pyP(t.entry)} r="2.5" fill={t.side === "long" ? "oklch(0.75 0.19 152)" : "oklch(0.66 0.22 22)"} />
            <circle cx={px(t.exitIdx, closes.length)} cy={pyP(t.exit)} r="2.5" fill={t.pnl >= 0 ? "oklch(0.75 0.19 152)" : "oklch(0.66 0.22 22)"} opacity="0.6" />
          </g>
        ))}
        <path d={equityD} fill="none" stroke="oklch(0.82 0.17 85)" strokeWidth="1.8" />
      </svg>
    </div>
  );
}
