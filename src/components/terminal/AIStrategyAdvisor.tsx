import { useState } from "react";
import { Brain, Clock, Loader2, ShieldAlert, Target } from "lucide-react";
import { toast } from "sonner";
import type { Analysis } from "@/lib/analysis";
import type { Candle } from "@/lib/derivApi";

export interface StrategyAdvice {
  bestStrategy: string;
  direction: "BUY" | "SELL" | "STAND_ASIDE";
  timing: "TAKE_NOW" | "WAIT_FOR_TRIGGER" | "AVOID";
  timingReason: string;
  entryWindow: string;
  sessionNote: string;
  confidence: number;
  checklist: string[];
  invalidation: string;
  riskNote: string;
}

const TIMING_STYLES: Record<StrategyAdvice["timing"], string> = {
  TAKE_NOW: "border-bull/40 bg-bull/10 text-bull",
  WAIT_FOR_TRIGGER: "border-accent/40 bg-accent/10 text-accent",
  AVOID: "border-bear/40 bg-bear/10 text-bear",
};

const TIMING_LABEL: Record<StrategyAdvice["timing"], string> = {
  TAKE_NOW: "Take now",
  WAIT_FOR_TRIGGER: "Wait for trigger",
  AVOID: "Avoid",
};

export function AIStrategyAdvisor({
  symbol,
  timeframe,
  price,
  balance,
  analysis,
  candles,
}: {
  symbol: string;
  timeframe: string;
  price: number | undefined;
  balance: number;
  analysis: Analysis | null;
  candles: Candle[];
}) {
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          timeframe,
          price,
          balance,
          clientTimeUtc: new Date().toISOString(),
          analysis: analysis
            ? {
                bias: analysis.bias,
                confidence: analysis.confidence,
                rsi: analysis.rsi,
                ema50: analysis.ema50,
                ema200: analysis.ema200,
                support: analysis.support,
                resistance: analysis.resistance,
                structureShift: analysis.structureShift,
                gaps: analysis.gaps.slice(-3),
                fib: analysis.fib,
                strategy: analysis.strategy,
                rationale: analysis.rationale,
                autonomousScore: analysis.autonomousScore,
                confluenceAligned: analysis.confluenceAligned,
              }
            : {},
          recentCandles: candles.slice(-40).map((c) => ({
            o: c.open,
            h: c.high,
            l: c.low,
            c: c.close,
          })),
        }),
      });
      if (!res.ok) {
        toast.error(await res.text());
        return;
      }
      setAdvice((await res.json()) as StrategyAdvice);
    } catch {
      toast.error("Could not reach PalTrade AI");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card/70 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Brain className="h-4 w-4 text-signal" />
          AI Strategy &amp; Timing
        </h2>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal transition-colors hover:bg-signal/20 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
          {loading ? "Analysing…" : "Ask AI"}
        </button>
      </header>

      {!advice && !loading && (
        <p className="text-xs text-muted-foreground">
          Let Lovable AI review {symbol} on {timeframe} — it picks the best-fitting strategy and tells
          you whether to take the trade now or wait for a trigger.
        </p>
      )}

      {advice && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-1 text-xs font-bold ${TIMING_STYLES[advice.timing]}`}>
              <Clock className="mr-1 inline h-3 w-3" />
              {TIMING_LABEL[advice.timing]}
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-xs font-bold">
              {advice.direction}
            </span>
            <span className="text-xs text-muted-foreground">{advice.confidence}% confidence</span>
          </div>

          <div>
            <p className="text-sm font-semibold">{advice.bestStrategy}</p>
            <p className="mt-1 text-xs text-muted-foreground">{advice.timingReason}</p>
          </div>

          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md border border-border/60 p-2">
              <dt className="text-muted-foreground">Entry window</dt>
              <dd className="mt-0.5 font-medium">{advice.entryWindow}</dd>
            </div>
            <div className="rounded-md border border-border/60 p-2">
              <dt className="text-muted-foreground">Session</dt>
              <dd className="mt-0.5 font-medium">{advice.sessionNote}</dd>
            </div>
          </dl>

          {advice.checklist.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {advice.checklist.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-signal">▸</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Invalidation：</span> {advice.invalidation}
          </p>
          <p className="flex gap-2 rounded-md border border-bear/30 bg-bear/5 p-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-bear" />
            {advice.riskNote}
          </p>
        </div>
      )}
    </section>
  );
}
