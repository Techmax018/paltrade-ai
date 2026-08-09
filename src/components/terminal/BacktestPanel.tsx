import { useState } from "react";
import { Loader2, PlayCircle, TrendingDown, TrendingUp } from "lucide-react";
import type { Candle, DerivSymbol, Timeframe } from "@/lib/derivApi";
import { TIMEFRAME_SECONDS } from "@/lib/derivApi";
import {
  DEFAULT_BACKTEST_OPTIONS,
  barsForRange,
  runStrategyBacktest,
  sliceRange,
  type BacktestOptions,
  type BacktestResult,
} from "@/lib/backtestEngine";

const TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15", "H1"];
const MAX_BARS = 5000;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function BacktestPanel({
  symbol,
  balance,
  getCandles,
}: {
  symbol: DerivSymbol;
  balance: number;
  getCandles: (symbol: string, tf: Timeframe, count: number) => Promise<Candle[]>;
}) {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);

  const [from, setFrom] = useState(isoDay(weekAgo));
  const [to, setTo] = useState(isoDay(today));
  const [timeframe, setTimeframe] = useState<Timeframe>("M5");
  const [opts, setOpts] = useState<BacktestOptions>({
    ...DEFAULT_BACKTEST_OPTIONS,
    startingBalance: Math.round(balance) || 10_000,
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [info, setInfo] = useState("");

  async function run() {
    setError("");
    setInfo("");
    const fromMs = new Date(`${from}T00:00:00Z`).getTime();
    const toMs = new Date(`${to}T23:59:59Z`).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      setError("Pick a valid date range (end after start).");
      return;
    }

    setRunning(true);
    try {
      // Warm-up bars are needed before the first signal can be evaluated.
      const needed = Math.min(MAX_BARS, barsForRange(fromMs, Date.now(), timeframe) + 250);
      const all = await getCandles(symbol.code, timeframe, needed);
      const ranged = sliceRange(all, fromMs, toMs);

      if (ranged.length < 60) {
        setError(
          `Only ${ranged.length} ${timeframe} candles available in that range. Widen the range or use a smaller timeframe.`,
        );
        setResult(null);
        return;
      }

      // Prepend warm-up history (before the range) so indicators are primed.
      const firstIdx = all.indexOf(ranged[0]);
      const warm = all.slice(Math.max(0, firstIdx - 220), firstIdx);
      const series = [...warm, ...ranged];

      const res = runStrategyBacktest(series, symbol, opts);
      setResult(res);
      const days = Math.round((toMs - fromMs) / 86_400_000);
      setInfo(
        `${ranged.length} ${timeframe} candles · ${days}d window · ${(TIMEFRAME_SECONDS[timeframe] / 60).toFixed(0)}m bars`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed.");
    } finally {
      setRunning(false);
    }
  }

  const s = result?.stats;

  return (
    <section className="w-full min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">Strategy Backtest — {symbol.label}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Replays the same AI signals over a historical window.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-signal px-3 py-2 text-xs font-bold text-background disabled:opacity-60"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          {running ? "Running…" : "Run"}
        </button>
      </header>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="From">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Timeframe">
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)} className={inputCls}>
            {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Min confidence %">
          <input
            type="number" min={0} max={100} value={opts.minConfidence}
            onChange={(e) => setOpts((o) => ({ ...o, minConfidence: Number(e.target.value) }))}
            className={inputCls}
          />
        </Field>
        <Field label="Target">
          <select
            value={opts.targetIndex}
            onChange={(e) => setOpts((o) => ({ ...o, targetIndex: Number(e.target.value) as 0 | 1 | 2 }))}
            className={inputCls}
          >
            <option value={0}>TP1</option>
            <option value={1}>TP2</option>
            <option value={2}>TP3</option>
          </select>
        </Field>
        <Field label="Risk % / trade">
          <input
            type="number" min={0.1} max={10} step={0.1} value={opts.riskPct}
            onChange={(e) => setOpts((o) => ({ ...o, riskPct: Number(e.target.value) }))}
            className={inputCls}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={opts.requireConfluence}
          onChange={(e) => setOpts((o) => ({ ...o, requireConfluence: e.target.checked }))}
          className="h-3.5 w-3.5 accent-[var(--signal,#06b6d4)]"
        />
        Require full confluence (same gate as Auto-Pilot)
      </label>

      {error && <p className="rounded-lg border border-bear/40 bg-bear/10 px-3 py-2 text-xs text-bear">{error}</p>}
      {info && !error && <p className="font-mono text-[11px] text-muted-foreground">{info}</p>}

      {/* Results */}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Trades" value={String(s.trades)} />
            <Stat label="Win rate" value={`${s.winRate.toFixed(1)}%`} tone={s.winRate >= 50 ? "bull" : "bear"} />
            <Stat
              label="Net P&L"
              value={`${s.netPnl >= 0 ? "+" : ""}${s.netPnl.toFixed(2)}`}
              tone={s.netPnl >= 0 ? "bull" : "bear"}
            />
            <Stat label="Return" value={`${s.returnPct >= 0 ? "+" : ""}${s.returnPct.toFixed(2)}%`} tone={s.returnPct >= 0 ? "bull" : "bear"} />
            <Stat label="Profit factor" value={Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"} />
            <Stat label="Expectancy" value={`${s.expectancyR.toFixed(2)}R`} tone={s.expectancyR >= 0 ? "bull" : "bear"} />
            <Stat label="Max DD" value={`${s.maxDrawdownPct.toFixed(2)}%`} tone="bear" />
            <Stat label="Bars tested" value={String(s.barsTested)} />
          </div>

          <EquityCurve points={result!.equityCurve.map((p) => p.equity)} />

          <div className="overflow-hidden rounded-xl border border-border/60">
            <div className="border-b border-border/60 px-3 py-2 text-xs font-medium">Simulated trades</div>
            <div className="max-h-64 overflow-y-auto">
              {result!.trades.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  No signals passed the filters in this window — lower the confidence threshold or widen the range.
                </div>
              )}
              {result!.trades.slice().reverse().map((t, i) => (
                <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-t border-border/40 px-3 py-2 font-mono text-[11px]">
                  <span className={`flex shrink-0 items-center gap-1 ${t.side === "BUY" ? "text-bull" : "text-bear"}`}>
                    {t.side === "BUY" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {t.side}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {new Date(t.entryTime).toLocaleDateString()} {new Date(t.entryTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" · "}{t.entry.toFixed(symbol.pipSize < 0.01 ? 5 : 2)} → {t.exit.toFixed(symbol.pipSize < 0.01 ? 5 : 2)}
                  </span>
                  <span className={`shrink-0 ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                    {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)} ({t.rMultiple.toFixed(2)}R)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Backtests are historical simulations with conservative fills (stop assumed first when a bar touches both levels)
        and exclude spread, swap and slippage. Past performance is not indicative of future results.
      </p>
    </section>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-input px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background/40 p-2.5">
      <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 truncate font-mono text-sm font-semibold ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function EquityCurve({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 600, H = 120, pad = 6;
  const min = Math.min(...points), max = Math.max(...points);
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / Math.max(1e-9, max - min)) * (H - pad * 2);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" aria-label="Equity curve">
        <path d={d} fill="none" stroke={up ? "oklch(0.75 0.19 152)" : "oklch(0.66 0.22 22)"} strokeWidth="2" />
      </svg>
    </div>
  );
}
