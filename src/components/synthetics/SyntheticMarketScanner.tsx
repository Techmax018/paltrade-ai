import { useMemo, useState } from "react";
import { Bot, Brain, ChartCandlestick, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { analyzeMarket, type Analysis } from "@/lib/analysis";
import { generateCandles, SYMBOLS, type Candle, type Timeframe } from "@/lib/derivApi";
import type { StrategyAdvice } from "@/components/terminal/AIStrategyAdvisor";

const SYNTHETICS = SYMBOLS.filter((symbol) => symbol.kind === "synthetic");
const TIMEFRAMES: Timeframe[] = ["M1", "M5", "M15", "H1"];

const TIMING_LABELS: Record<StrategyAdvice["timing"], string> = {
  TAKE_NOW: "Take now",
  WAIT_FOR_TRIGGER: "Wait for trigger",
  AVOID: "Avoid",
};

function adviceTone(timing: StrategyAdvice["timing"]) {
  if (timing === "TAKE_NOW") return "border-profit/40 bg-profit/10 text-profit";
  if (timing === "AVOID") return "border-bear/40 bg-bear/10 text-bear";
  return "border-accent/40 bg-accent/10 text-accent";
}

export function SyntheticMarketScanner() {
  const [symbolCode, setSymbolCode] = useState(SYNTHETICS[0]?.code ?? "R_75");
  const [timeframe, setTimeframe] = useState<Timeframe>("M5");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [open, setOpen] = useState(false);
  const symbol = useMemo(
    () => SYNTHETICS.find((item) => item.code === symbolCode) ?? SYNTHETICS[0],
    [symbolCode],
  );

  function loadMarket() {
    if (!symbol) return;
    setLoadingMarket(true);
    setAdvice(null);
    window.setTimeout(() => {
      const next = generateCandles(symbol.code, timeframe, 300);
      const latest = next.at(-1)?.close ?? symbol.basePrice;
      setCandles(next);
      setAnalysis(analyzeMarket(next, latest));
      setLoadingMarket(false);
      toast.success(`${symbol.label} market loaded`);
    }, 350);
  }

  async function scanWithAi() {
    if (!symbol) return;
    let sourceCandles = candles;
    let sourceAnalysis = analysis;
    if (!sourceCandles.length || !sourceAnalysis) {
      sourceCandles = generateCandles(symbol.code, timeframe, 300);
      sourceAnalysis = analyzeMarket(sourceCandles, sourceCandles.at(-1)?.close ?? symbol.basePrice);
      setCandles(sourceCandles);
      setAnalysis(sourceAnalysis);
    }

    setLoadingAi(true);
    try {
      const price = sourceCandles.at(-1)?.close ?? symbol.basePrice;
      const response = await fetch("/api/ai/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.code,
          timeframe,
          price,
          clientTimeUtc: new Date().toISOString(),
          analysis: sourceAnalysis,
          recentCandles: sourceCandles.slice(-40).map((candle) => ({
            o: candle.open,
            h: candle.high,
            l: candle.low,
            c: candle.close,
          })),
        }),
      });
      if (!response.ok) throw new Error((await response.text()) || "AI scan failed");
      setAdvice((await response.json()) as StrategyAdvice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reach Pal AI");
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <>
      <section className="mt-10 border-y border-border/60 py-8" aria-labelledby="market-scanner-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-signal">Manual + Pal AI</p>
            <h2 id="market-scanner-title" className="mt-1 text-xl font-bold">Synthetic market scanner</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Market
              <select
                value={symbolCode}
                onChange={(event) => { setSymbolCode(event.target.value); setAnalysis(null); setAdvice(null); }}
                className="h-9 max-w-[220px] rounded-md border border-border bg-input px-3 text-sm text-foreground"
              >
                {SYNTHETICS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Timeframe
              <select
                value={timeframe}
                onChange={(event) => { setTimeframe(event.target.value as Timeframe); setAnalysis(null); setAdvice(null); }}
                className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground"
              >
                {TIMEFRAMES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
          <div className="rounded-lg border border-border/60 bg-card/60 p-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={loadMarket} disabled={loadingMarket}>
                {loadingMarket ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Load market
              </Button>
              <Button type="button" onClick={scanWithAi} disabled={loadingAi}>
                {loadingAi ? <Loader2 className="animate-spin" /> : <Brain />}
                Scan with Pal AI
              </Button>
            </div>

            {analysis ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Bias" value={analysis.bias} />
                <Metric label="Confidence" value={`${analysis.confidence}%`} />
                <Metric label="RSI (14)" value={analysis.rsi?.toFixed(1) ?? "—"} />
                <Metric label="Signal" value={analysis.confluenceAligned ? "Aligned" : "Wait"} />
                <div className="sm:col-span-2 lg:col-span-4">
                  <p className="text-xs text-muted-foreground">Manual strategy signal</p>
                  <p className="mt-1 text-sm font-semibold">{analysis.strategy}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{analysis.rationale[0]}</p>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex min-h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
                <ChartCandlestick className="h-5 w-5" /> Select a market and load its chart signals.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border/60 bg-card/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-signal" /> Pal AI decision</p>
            {advice ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-2 py-1 text-xs font-bold ${adviceTone(advice.timing)}`}>{TIMING_LABELS[advice.timing]}</span>
                  <span className="rounded-md border border-border px-2 py-1 text-xs font-bold">{advice.direction}</span>
                  <span className="text-xs text-muted-foreground">{advice.confidence}%</span>
                </div>
                <p className="text-sm font-semibold">{advice.bestStrategy}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{advice.timingReason}</p>
                <div className="border-l-2 border-signal pl-3 text-xs">
                  <p className="text-muted-foreground">Entry window</p>
                  <p className="mt-1 font-medium">{advice.entryWindow}</p>
                </div>
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Invalidation:</span> {advice.invalidation}</p>
              </div>
            ) : (
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Pal AI reviews structure, momentum, timing and invalidation. It will recommend taking the setup, waiting for a trigger, or avoiding the market.</p>
            )}
          </div>
        </div>
      </section>

      <Button
        type="button"
        size="icon"
        aria-label={open ? "Close Pal AI scanner" : "Open Pal AI scanner"}
        title="Pal AI market scanner"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full shadow-card"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
      </Button>

      {open && (
        <aside className="fixed bottom-24 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-signal/30 bg-card p-4 shadow-card" aria-label="Pal AI quick scanner">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-signal" />
            <div>
              <p className="text-sm font-bold">Pal AI</p>
              <p className="text-xs text-muted-foreground">Scan {symbol?.label ?? "synthetics"} on {timeframe}</p>
            </div>
          </div>
          <Button type="button" className="mt-4 w-full" onClick={() => { setOpen(false); void scanWithAi(); }} disabled={loadingAi}>
            {loadingAi ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Scan and load market
          </Button>
        </aside>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}