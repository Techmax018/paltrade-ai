import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  Brain,
  Download,
  Gauge,
  Loader2,
  PauseCircle,
  Play,
  Radar,
  Shield,
  Sliders,
  Sparkles,
  X,
  StopCircle,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
const TRADE_TYPES = ["Rise/Fall", "Digits", "Higher/Lower"];

type BotStep = 1 | 2 | 3;
type BotStatus = "Running" | "Paused" | "Stopped";

type RiskConfig = {
  initialStake: number;
  martingale: number;
  martingaleEnabled: boolean;
  stopLoss: number;
  takeProfit: number;
  totalRuns: number;
};

export function GlobalEntryScanner() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<BotStep>(1);
  const [symbolCode, setSymbolCode] = useState(SYNTHETICS[0]?.code ?? "R_75");
  const [timeframe, setTimeframe] = useState<Timeframe>("M5");
  const [statusText, setStatusText] = useState("Bot ready");
  const [tradeType, setTradeType] = useState("Rise/Fall");
  const [ticks, setTicks] = useState(500);
  const [predictionPath, setPredictionPath] = useState("Bearish pullback sell setup");
  const [loadingAi, setLoadingAi] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus>("Running");
  const [riskConfig, setRiskConfig] = useState<RiskConfig>({
    initialStake: 10,
    martingale: 2,
    martingaleEnabled: true,
    stopLoss: 50,
    takeProfit: 100,
    totalRuns: 10,
  });
  const [executionTab, setExecutionTab] = useState<"summary" | "transactions" | "journal">("summary");
  const [liveStats, setLiveStats] = useState({
    currentBalance: 1250,
    profit: 165,
    runsExecuted: 7,
    wins: 7,
    losses: 2,
    latencyMs: 180,
  });

  const symbol = useMemo(
    () => SYNTHETICS.find((item) => item.code === symbolCode) ?? SYNTHETICS[0],
    [symbolCode],
  );

  const { status: liveStatus, connection: liveConnection } = useDerivWebSocket({
    appId: DERIV_APP_ID,
    accountType: "demo",
  });
  const liveAvailable = liveConnection !== null && liveStatus === "connected";

  useEffect(() => {
    if (step !== 3 || botStatus !== "Running") return;

    const timer = window.setInterval(() => {
      setLiveStats((prev) => ({
        ...prev,
        runsExecuted: Math.min(riskConfig.totalRuns, prev.runsExecuted + 1),
        currentBalance: Math.round(prev.currentBalance + (Math.random() - 0.45) * 35),
        profit: Math.round(prev.profit + (Math.random() - 0.4) * 22),
        wins: Math.min(prev.wins + (Math.random() > 0.42 ? 1 : 0), riskConfig.totalRuns),
        losses: Math.max(prev.losses + (Math.random() > 0.7 ? 1 : 0), 0),
        latencyMs: Math.round(120 + Math.random() * 110),
      }));
    }, 1800);

    return () => window.clearInterval(timer);
  }, [step, botStatus, riskConfig.totalRuns]);

  const winRate = Math.max(0, Math.min(100, Math.round((liveStats.wins / (liveStats.wins + liveStats.losses || 1)) * 100)));

  async function scanForBestMarket() {
    if (!symbol) return;
    setLoadingAi(true);
    setStatusText("Scanning market...");

    try {
      const sourceCandles = generateCandles(symbol.code, timeframe, 300);
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

      const text = await response.text();
      let data: StrategyAdvice | null = null;
      if (text) {
        try {
          data = JSON.parse(text) as StrategyAdvice;
        } catch {
          data = null;
        }
      }

      if (!response.ok && !data) {
        throw new Error(text || "AI scan failed");
      }

      const resolvedAdvice = data ?? {
        bestStrategy: "Local fallback strategy",
        direction: "STAND_ASIDE",
        timing: "WAIT_FOR_TRIGGER",
        timingReason: "AI API is unavailable; using a conservative local fallback signal.",
        entryWindow: "Wait for confirmation",
        sessionNote: "Local fallback mode",
        confidence: 55,
        checklist: ["Trend confirms", "Entry is clean", "No forced trade"],
        invalidation: "Break of structure invalidates the trade",
        riskNote: "Avoid forcing risk during weak confluence.",
      } as StrategyAdvice;

      setAdvice(resolvedAdvice);
      setPredictionPath(resolvedAdvice.bestStrategy || "Bearish pullback sell setup");
      setTradeType(resolvedAdvice.timing ?? tradeType);
      setStatusText(response.ok ? "Scan complete" : "Fallback scan complete");
      toast.success(response.ok ? "Synthetic scan complete" : "AI unavailable — fallback strategy loaded");
    } catch (error) {
      setPredictionPath("Bearish pullback sell setup");
      setStatusText("Bot ready");
      toast.error(error instanceof Error ? error.message : "Could not complete scan");
    } finally {
      setLoadingAi(false);
    }
  }

  const goToNextStep = () => {
    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2) {
      setBotStatus("Running");
      setStatusText("Execution active");
      setStep(3);
    }
  };

  const startPauseBot = () => {
    setBotStatus((current) => (current === "Running" ? "Paused" : "Running"));
    setStatusText(botStatus === "Running" ? "Bot paused" : "Execution active");
  };

  const stopBot = () => {
    setBotStatus("Stopped");
    setStatusText("Bot stopped");
  };

  const exportLog = () => {
    const log = {
      market: symbol?.label,
      timeframe,
      tradeType,
      predictionPath,
      config: riskConfig,
      stats: liveStats,
      status: botStatus,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "paltrade-bot-log.json";
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Bot log exported");
  };

  const stepLabel = step === 1 ? "Entry scanner" : step === 2 ? "Bot config" : "Live execution";

  const transactionRows = [
    {
      direction: "down",
      type: "SELL",
      entry: "13398.959",
      exit: "13398.959",
      buyPrice: "0.50 USD",
      pnl: "+0.09 USD",
      pnlTone: "profit",
    },
    {
      direction: "down",
      type: "SELL",
      entry: "13398.959",
      exit: "13398.959",
      buyPrice: "0.50 USD",
      pnl: "-0.50 USD",
      pnlTone: "loss",
    },
    {
      direction: "down",
      type: "SELL",
      entry: "13398.959",
      exit: "13398.959",
      buyPrice: "0.50 USD",
      pnl: "+0.20 USD",
      pnlTone: "profit",
    },
  ];

  const totalStake = transactionRows.length * 0.5;
  const totalPayout = transactionRows.reduce((sum, row) => {
    const numeric = Number.parseFloat(row.pnl.replace(/[^\d.-]/g, "") || "0");
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);
  const contractsWon = transactionRows.filter((row) => row.pnlTone === "profit").length;
  const contractsLost = transactionRows.filter((row) => row.pnlTone === "loss").length;
  const totalProfitLoss = totalPayout - totalStake;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label="Open bot workflow"
          title="PalTrade bot workflow"
          className="fixed bottom-6 right-6 z-[9999] h-12 w-12 rounded-full p-0.5 bg-gradient-to-tr from-rose-500 via-pink-500 to-fuchsia-500 shadow-[0_0_12px_rgba(236,72,153,0.35)] transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <div className="h-full w-full overflow-hidden rounded-full bg-slate-950">
            <img src={palAiLogo} alt="PalTrade AI" className="h-full w-full rounded-full object-cover" />
          </div>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl rounded-[28px] border border-slate-800 bg-slate-950 p-0 text-slate-100 shadow-2xl">
        <div className="border-b border-slate-800 bg-slate-900/80 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300">PalTrade</p>
              <div className="mt-1 text-lg font-semibold">{stepLabel}</div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-slate-300">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              Step {step}/3
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex flex-1 items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${step >= item ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-400"}`}>
                  {item}
                </div>
                {item < 3 && <div className={`h-px flex-1 ${step > item ? "bg-cyan-500" : "bg-slate-700"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-5">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="rounded-2xl bg-[#EFF6FF] p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-600">Selected market</div>
                      <select
                        value={symbolCode}
                        onChange={(e) => setSymbolCode(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value={symbolCode}>Volatility 75 Index (R_75)</option>
                        {SYNTHETICS.slice(0, 6).map((item) => (
                          <option key={item.code} value={item.code}>{item.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-600">Trade type</div>
                      <select
                        value={tradeType}
                        onChange={(e) => setTradeType(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option>Under 8 Recovery Under 5</option>
                        {TRADE_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-600">Ticks number (100-5000)</div>
                      <input
                        type="number"
                        min={100}
                        max={5000}
                        value={ticks}
                        onChange={(e) => setTicks(Math.min(5000, Math.max(100, Number(e.target.value || 100))))}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-slate-600">Prediction path</div>
                      <input
                        type="text"
                        value={predictionPath}
                        onChange={(e) => setPredictionPath(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <div>Volatility 75 Index</div>
                      <div className="text-xs text-slate-600">13/13</div>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-white">
                      <div className="h-full rounded-full bg-[#1D4ED8] transition-all" style={{ width: `100%` }} />
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-[#E0F2FE] p-3 text-sm text-slate-800">
                    Best market: Volatility 75 Index | Under 8 Recovery Under 5 | Entry 0 | Quality 96.94%
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Button
                      type="button"
                      onClick={scanForBestMarket}
                      disabled={loadingAi}
                      className="rounded-full bg-[#1D4ED8] text-white hover:brightness-105"
                    >
                      {loadingAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radar className="mr-2 h-4 w-4" />}
                      Scan for Best Market
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(2)}
                      className="rounded-full border border-[#BFDBFE] bg-white text-[#1E40AF]"
                    >
                      Load and Run Bot
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="rounded-2xl bg-white p-4">
                  <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <Sliders className="h-5 w-5 text-slate-700" />
                    Scanner Parameters
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Stake amount (USD)">
                      <input
                        type="number"
                        step="0.1"
                        value={riskConfig.initialStake}
                        onChange={(e) => setRiskConfig((prev) => ({ ...prev, initialStake: Number(e.target.value || 0) }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </Field>

                    <Field label="Martingale multiplier">
                      <input
                        type="number"
                        step="0.1"
                        value={riskConfig.martingale}
                        onChange={(e) => setRiskConfig((prev) => ({ ...prev, martingale: Number(e.target.value || 1) }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </Field>

                    <Field label="Target wins">
                      <input
                        type="number"
                        min={1}
                        value={riskConfig.totalRuns}
                        onChange={(e) => setRiskConfig((prev) => ({ ...prev, totalRuns: Number(e.target.value || 1) }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </Field>

                    <Field label="Stop loss threshold">
                      <input
                        type="number"
                        value={riskConfig.stopLoss}
                        onChange={(e) => setRiskConfig((prev) => ({ ...prev, stopLoss: Number(e.target.value || 0) }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </Field>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={riskConfig.martingaleEnabled}
                        onChange={() => setRiskConfig((prev) => ({ ...prev, martingaleEnabled: !prev.martingaleEnabled }))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Use Martingale
                    </label>

                    <div className="flex gap-2">
                      <Button type="button" variant="outline" className="rounded-full bg-slate-100 text-slate-800 border border-slate-200" onClick={() => setStep(1)}>
                        Cancel
                      </Button>
                      <Button type="button" className="rounded-full bg-[#1D4ED8] text-white" onClick={goToNextStep}>
                        Load and Run
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="rounded-2xl bg-[#0f172a] p-3 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-1">
                      {(["summary", "transactions", "journal"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setExecutionTab(tab)}
                          className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] capitalize transition ${executionTab === tab ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" className="text-slate-200 flex items-center gap-2 px-2">
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <Button type="button" variant="ghost" className="text-slate-200 px-2">
                        View Detail
                      </Button>
                    </div>
                  </div>

                  {executionTab === "summary" && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Best market</div>
                        <div className="mt-2 text-sm text-slate-100">
                          Best market: Volatility 75 Index | Under 8 Recovery Under 5 | Entry 0 | Quality 96.94%
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <MetricBox label="Total stake" value="$10.00" icon={<Gauge className="h-4 w-4" />} />
                        <MetricBox label="Total payout" value="$10.30" icon={<BarChart3 className="h-4 w-4" />} />
                        <MetricBox label="Runs" value="3" icon={<Activity className="h-4 w-4" />} />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <MetricBox label="Contracts won" value="2" icon={<TrendingUp className="h-4 w-4" />} />
                        <MetricBox label="Contracts lost" value="1" icon={<ArrowDownRight className="h-4 w-4" />} />
                      </div>
                    </div>
                  )}

                  {executionTab === "transactions" && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
                      <table className="min-w-full text-left text-xs text-slate-200">
                        <thead className="bg-slate-800/80 text-[10px] uppercase tracking-[0.2em] text-slate-300">
                          <tr>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Entry/Exit spot</th>
                            <th className="px-3 py-2 font-medium">Buy price</th>
                            <th className="px-3 py-2 font-medium">P/L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionRows.map((row, index) => (
                            <tr key={`${row.type}-${index}`} className="border-t border-slate-800">
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${row.direction === "down" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                                    <ArrowDownRight className="h-3.5 w-3.5" />
                                  </span>
                                  <span className="font-semibold uppercase">{row.type}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2 text-slate-200">
                                  <span className="inline-flex h-2.5 w-2.5 rounded-full border-2 border-red-400 bg-red-500" />
                                  <span className="font-mono text-[11px]">{row.entry}</span>
                                  <span className="mx-1 text-slate-500">→</span>
                                  <span className="inline-flex h-2.5 w-2.5 rounded-full border-2 border-slate-300 bg-transparent" />
                                  <span className="font-mono text-[11px]">{row.exit}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 font-mono text-[11px] text-slate-100">{row.buyPrice}</td>
                              <td className={`px-3 py-3 font-mono text-[11px] font-semibold ${row.pnlTone === "profit" ? "text-emerald-400" : "text-red-400"}`}>
                                {row.pnl}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="grid gap-2 border-t border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Total stake</div>
                          <div className="mt-1 font-mono text-sm text-slate-100">${totalStake.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Total payout</div>
                          <div className="mt-1 font-mono text-sm text-slate-100">${totalPayout.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Total P/L</div>
                          <div className={`mt-1 font-mono text-sm ${totalProfitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {totalProfitLoss >= 0 ? "+" : "-"}${Math.abs(totalProfitLoss).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {executionTab === "journal" && (
                    <div className="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                      <div className="text-xs text-slate-400">2026-08-17 | 14:36:17 GMT</div>
                      <div className="text-teal-300">Your Entry Point &gt;&gt; 0 || Current Last Digit &gt;&gt;&gt; 2</div>
                      <div className="rounded-md bg-[#071133] p-3 text-red-300">
                        Variable 'currentstat' has no value... <button className="ml-3 rounded bg-red-700 px-2 py-1 text-[10px] uppercase tracking-[0.18em]">Go to block</button>
                      </div>
                      <div className="text-slate-300">System: You are using your USD account.</div>
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    <span>No. of runs <span className="ml-1 font-mono text-[11px] text-slate-100">{transactionRows.length}</span></span>
                    <span>Contracts lost <span className="ml-1 font-mono text-[11px] text-red-400">{contractsLost}</span></span>
                    <span>Contracts won <span className="ml-1 font-mono text-[11px] text-emerald-400">{contractsWon}</span></span>
                    <span>Total profit/loss <span className={`ml-1 font-mono text-[11px] ${totalProfitLoss >= 0 ? "text-emerald-400" : "text-red-400"}`}>{totalProfitLoss >= 0 ? "+" : "-"}${Math.abs(totalProfitLoss).toFixed(2)}</span></span>
                  </div>

                  <div className="mt-4">
                    <Button type="button" variant="outline" className="w-full rounded-full border border-slate-600 text-slate-200" onClick={() => setStep(1)}>
                      Reset
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-slate-700">
      <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function MetricBox({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-slate-400">
        <span>{label}</span>
        <span className="text-cyan-300">{icon}</span>
      </div>
      <div className="text-base font-semibold text-white">{value}</div>
    </div>
  );
}
