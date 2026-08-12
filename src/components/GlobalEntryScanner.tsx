import { useMemo, useState } from "react";
import { Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { analyzeMarket, type Analysis } from "@/lib/analysis";
import { DERIV_APP_ID, generateCandles, SYMBOLS, type Candle, type Timeframe } from "@/lib/derivApi";
import { useDerivWebSocket } from "@/hooks/useDerivWebSocket";
import type { StrategyAdvice } from "@/components/terminal/AIStrategyAdvisor";
import palAiLogo from "../../paltrade/palai  logo.png";

const SYNTHETICS = SYMBOLS.filter((symbol) => symbol.kind === "synthetic");

export function GlobalEntryScanner() {
  const [open, setOpen] = useState(false);
  const [symbolCode, setSymbolCode] = useState(SYNTHETICS[0]?.code ?? "R_75");
  const [timeframe, setTimeframe] = useState<Timeframe>("M5");
  const [statusText, setStatusText] = useState("Not scanned yet");
  const [tradeType, setTradeType] = useState("Waiting for scan");
  const [predictionPath, setPredictionPath] = useState("--");
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [botActive, setBotActive] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);

  const symbol = useMemo(
    () => SYNTHETICS.find((item) => item.code === symbolCode) ?? SYNTHETICS[0],
    [symbolCode],
  );

  const { status: liveStatus, connection: liveConnection } = useDerivWebSocket({
    appId: DERIV_APP_ID,
    accountType: "demo",
  });
  const liveAvailable = liveConnection !== null && liveStatus === "connected";

  async function loadMarket() {
    if (!symbol) return;
    setLoadingMarket(true);
    setAdvice(null);
    setTradeType("Loading market...");

    try {
      let next: Candle[];
      if (liveAvailable && liveConnection) {
        next = await liveConnection.getCandles(symbol.code, timeframe, 300);
      } else {
        next = generateCandles(symbol.code, timeframe, 300);
      }

      const latest = next.at(-1)?.close ?? symbol.basePrice;
      setAnalysis(analyzeMarket(next, latest));
      setStatusText("Market loaded");
      setTradeType("Market ready");
      toast.success(`${symbol.label} market loaded ${liveAvailable ? "from Deriv" : "(simulated)"}`);
    } catch (error) {
      setStatusText("Fallback market loaded");
      setTradeType("Market ready");
      toast.warning(`Loaded synthetic market fallback. ${error instanceof Error ? error.message : "Deriv candles unavailable"}`);
    } finally {
      setLoadingMarket(false);
    }
  }

  async function scanForBestMarket() {
    if (!symbol) return;
    setLoadingAi(true);
    setTradeType("Scanning...");
    setPredictionPath("Scanning...");

    try {
      let sourceCandles = generateCandles(symbol.code, timeframe, 300);
      const sourceAnalysis = analyzeMarket(sourceCandles, sourceCandles.at(-1)?.close ?? symbol.basePrice);
      setAnalysis(sourceAnalysis);

      const response = await fetch("/api/ai/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: symbol.code,
          timeframe,
          price: sourceCandles.at(-1)?.close ?? symbol.basePrice,
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
      const data = (await response.json()) as StrategyAdvice;
      setAdvice(data);
      setPredictionPath(data.bestStrategy ?? "--");
      setTradeType(data.timing ?? "Ready");
      setStatusText("Scan complete");
      toast.success("Synthetic scan complete");
    } catch (error) {
      setPredictionPath("--");
      setTradeType("Scan failed");
      setStatusText("Scan failed");
      toast.error(error instanceof Error ? error.message : "Could not complete scan");
    } finally {
      setLoadingAi(false);
    }
  }

  function launchBot() {
    setBotActive(true);
    setTradeType("Bot running");
    setStatusText("Bot launched");
    toast.success("Bot launched");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label="Open entry scanner"
          title="Entry scanner"
          className="fixed bottom-6 right-6 z-[9999] h-12 w-12 rounded-full p-0.5 bg-gradient-to-tr from-rose-500 via-pink-500 to-fuchsia-500 shadow-[0_0_12px_rgba(236,72,153,0.35)] transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <div className="h-full w-full overflow-hidden rounded-full bg-slate-950">
            <img
              src={palAiLogo}
              alt="PalTrade AI"
              className="h-full w-full object-cover rounded-full"
            />
          </div>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl rounded-3xl border border-border/70 bg-slate-950 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle>Entry Scanner</DialogTitle>
          <DialogDescription>
            Scan the synthetic market or launch the bot from any page.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 grid gap-4 rounded-[32px] border border-slate-800 bg-slate-900/90 p-5 text-sm text-slate-300 shadow-inner">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/80 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Selected market</p>
              <p className="mt-2 text-sm font-semibold text-white">{symbol?.label ?? "Scan for best market"}</p>
            </div>
            <div className="rounded-2xl bg-slate-950/80 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Trade type</p>
              <p className="mt-2 text-sm font-semibold text-white">{tradeType}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950/80 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Ticks number (100-5000)</p>
              <p className="mt-2 text-sm font-semibold text-white">500</p>
            </div>
            <div className="rounded-2xl bg-slate-950/80 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Prediction path</p>
              <p className="mt-2 text-sm font-semibold text-white">{predictionPath}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 p-4 text-xs text-slate-400">{statusText}</div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            className="col-span-2 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-xl shadow-cyan-500/20 hover:brightness-110"
            onClick={scanForBestMarket}
            disabled={loadingAi}
          >
            {loadingAi ? <Loader2 className="animate-spin" /> : "Scan for Best Market"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-full border-slate-700 text-slate-100 hover:bg-slate-900"
            onClick={launchBot}
          >
            <Brain />
            Load and Run Bot
          </Button>
        </div>

        <DialogFooter className="mt-6 justify-end">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
