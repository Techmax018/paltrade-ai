import { useMemo } from "react";
import type { Candle, DerivSymbol, Timeframe } from "@/lib/derivApi";
import { SYMBOLS, ema, rsi, fibRetracement } from "@/lib/derivApi";

const TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15", "H1"];

export function ChartContainer({
  candles,
  symbol,
  timeframe,
  price,
  showFib,
  showEma,
  showRsi,
  onSymbolChange,
  onTimeframeChange,
  onToggle,
}: {
  candles: Candle[];
  symbol: DerivSymbol;
  timeframe: Timeframe;
  price: number;
  showFib: boolean;
  showEma: boolean;
  showRsi: boolean;
  onSymbolChange: (code: string) => void;
  onTimeframeChange: (t: Timeframe) => void;
  onToggle: (key: "fib" | "ema" | "rsi") => void;
}) {
  const view = useMemo(() => candles.slice(-90), [candles]);
  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const e50 = useMemo(() => ema(closes, 50).slice(-90), [closes]);
  const e200 = useMemo(() => ema(closes, 200).slice(-90), [closes]);
  const rsiSeries = useMemo(() => rsi(closes, 14).slice(-90), [closes]);
  const fib = useMemo(() => fibRetracement(candles, 60), [candles]);

  const W = 1000;
  const H = 420;
  const RSI_H = 110;
  const PAD = 8;

  const highs = view.map((c) => c.high);
  const lows = view.map((c) => c.low);
  const fibPrices = showFib && fib ? fib.levels.map((l) => l.price) : [];
  const max = Math.max(...highs, ...fibPrices, price);
  const min = Math.min(...lows, ...fibPrices, price);
  const span = max - min || 1;
  const y = (v: number) => PAD + ((max - v) / span) * (H - PAD * 2);
  const bw = W / Math.max(view.length, 1);
  const decimals = symbol.pipSize < 0.001 ? 5 : symbol.pipSize < 0.1 ? 3 : 2;
  const fmt = (v: number) => v.toFixed(decimals);

  const line = (series: (number | null)[]) =>
    series
      .map((v, i) => (v === null ? null : `${i * bw + bw / 2},${y(v)}`))
      .filter(Boolean)
      .join(" ");

  const ry = (v: number) => RSI_H - (v / 100) * RSI_H;
  const rsiLine = rsiSeries
    .map((v, i) => (v === null ? null : `${i * bw + bw / 2},${ry(v)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <section className="rounded-2xl border border-border bg-card/60 p-4 shadow-card backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={symbol.code}
          onChange={(e) => onSymbolChange(e.target.value)}
          aria-label="Select trading symbol"
          className="rounded-md border border-border bg-input px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {SYMBOLS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>

        <div className="flex rounded-md bg-input p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              onClick={() => onTimeframeChange(t)}
              className={`rounded px-2.5 py-1 text-xs font-semibold ${
                timeframe === t ? "bg-signal/20 text-signal" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-lg font-semibold text-signal">{fmt(price)}</span>
          {(
            [
              ["ema", "EMA 50/200", showEma],
              ["rsi", "RSI 14", showRsi],
              ["fib", "Fibonacci", showFib],
            ] as const
          ).map(([key, label, on]) => (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                on ? "border-signal/50 bg-signal/10 text-signal" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border/60 bg-background/40">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[300px] w-full md:h-[420px]" preserveAspectRatio="none" role="img" aria-label={`${symbol.label} ${timeframe} candlestick chart`}>
          {[0.2, 0.4, 0.6, 0.8].map((g) => (
            <line key={g} x1="0" x2={W} y1={g * H} y2={g * H} stroke="var(--border)" strokeWidth="1" />
          ))}

          {showFib &&
            fib?.levels.map((l) => (
              <g key={l.level}>
                <line
                  x1="0"
                  x2={W}
                  y1={y(l.price)}
                  y2={y(l.price)}
                  stroke={l.level === 0.618 ? "var(--gold)" : "var(--signal)"}
                  strokeDasharray="6 6"
                  strokeWidth="1.5"
                  opacity="0.7"
                />
                <text x="8" y={y(l.price) - 5} fontSize="12" fill={l.level === 0.618 ? "var(--gold)" : "var(--signal)"}>
                  {l.level} · {fmt(l.price)}
                </text>
              </g>
            ))}

          {view.map((c, i) => {
            const up = c.close >= c.open;
            const color = up ? "var(--profit)" : "var(--bear)";
            const x = i * bw + bw / 2;
            const top = y(Math.max(c.open, c.close));
            const bot = y(Math.min(c.open, c.close));
            return (
              <g key={c.time}>
                <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1.2" />
                <rect x={x - bw * 0.3} y={top} width={bw * 0.6} height={Math.max(bot - top, 1)} fill={color} />
              </g>
            );
          })}

          {showEma && (
            <>
              <polyline points={line(e50)} fill="none" stroke="var(--signal)" strokeWidth="2" />
              <polyline points={line(e200)} fill="none" stroke="var(--gold)" strokeWidth="2" />
            </>
          )}

          <line x1="0" x2={W} y1={y(price)} y2={y(price)} stroke="var(--foreground)" strokeDasharray="3 5" strokeWidth="1" opacity="0.6" />
        </svg>

        {showRsi && (
          <div className="border-t border-border/60">
            <svg viewBox={`0 0 ${W} ${RSI_H}`} className="h-[90px] w-full" preserveAspectRatio="none" role="img" aria-label="RSI 14 indicator">
              <rect x="0" y={ry(70)} width={W} height={ry(30) - ry(70)} fill="var(--signal)" opacity="0.06" />
              <line x1="0" x2={W} y1={ry(70)} y2={ry(70)} stroke="var(--bear)" strokeDasharray="4 4" strokeWidth="1" />
              <line x1="0" x2={W} y1={ry(30)} y2={ry(30)} stroke="var(--profit)" strokeDasharray="4 4" strokeWidth="1" />
              <polyline points={rsiLine} fill="none" stroke="var(--signal)" strokeWidth="2" />
            </svg>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-signal align-middle" />EMA 50 / RSI</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-gold align-middle" />EMA 200 / 61.8% zone</span>
        <span>Range {fmt(min)} – {fmt(max)}</span>
      </div>
    </section>
  );
}
