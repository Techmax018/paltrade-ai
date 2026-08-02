import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { TerminalHeader } from "@/components/terminal/TerminalHeader";
import { ChartContainer } from "@/components/terminal/ChartContainer";
import { StrategyPanel, type ExecutionPlan } from "@/components/terminal/StrategyPanel";
import { PositionsTable, pnlOf, type ClosedTrade, type Position } from "@/components/terminal/PositionsTable";
import { SettingsModal, type SettingsValues } from "@/components/terminal/SettingsModal";
import {
  SYMBOLS,
  connectWebSocket,
  type AccountInfo,
  type Candle,
  type ConnectionStatus,
  type DerivConnection,
  type Timeframe,
} from "@/lib/derivApi";
import { analyzeMarket, type Analysis } from "@/lib/analysis";
import { getOrigin } from "@/lib/og";

export const Route = createFileRoute("/terminal")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const img = `${origin}/og-home.jpg`;
    return {
      meta: [
        { title: "Trading Terminal — PalTrade Deriv Forex & Synthetics" },
        {
          name: "description",
          content:
            "Trade Forex and synthetic indices with live candlestick charts, RSI, EMA and Fibonacci confluence, AI market analysis and one-click Deriv execution.",
        },
        { property: "og:title", content: "PalTrade Terminal — Deriv Forex & Synthetic Trading" },
        {
          property: "og:description",
          content: "Live charts, AI strategy engine, lot size calculator and triple-trade execution in one dark terminal.",
        },
        { property: "og:url", content: "/terminal" },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: "/terminal" }],
    };
  },
  component: TerminalPage,
});

function TerminalPage() {
  const [settings, setSettings] = useState<SettingsValues>({ appId: "", token: "", accountType: "demo" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const [symbolCode, setSymbolCode] = useState(SYMBOLS[0].code);
  const [timeframe, setTimeframe] = useState<Timeframe>("M5");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [overlays, setOverlays] = useState({ fib: true, ema: true, rsi: true });

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [tripleMode, setTripleMode] = useState(false);

  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<ClosedTrade[]>([]);

  const connRef = useRef<DerivConnection | null>(null);
  const symbol = useMemo(() => SYMBOLS.find((s) => s.code === symbolCode) ?? SYMBOLS[0], [symbolCode]);
  const price = prices[symbolCode] ?? candles.at(-1)?.close ?? symbol.basePrice;

  // connect / reconnect
  useEffect(() => {
    const conn = connectWebSocket({ appId: settings.appId, token: settings.token, accountType: settings.accountType });
    connRef.current = conn;
    const offStatus = conn.onStatus(setStatus);
    const offAccount = conn.onAccount(setAccount);
    return () => {
      offStatus();
      offAccount();
      conn.disconnect();
    };
  }, [settings.appId, settings.token, settings.accountType]);

  // candles
  const [seedPrice, setSeedPrice] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSeedPrice(null);
    connRef.current?.getCandles(symbolCode, timeframe, 300).then((c) => {
      if (cancelled) return;
      setCandles(c);
      setSeedPrice(c.at(-1)?.close ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [symbolCode, timeframe, status]);

  // ticks
  useEffect(() => {
    const conn = connRef.current;
    if (!conn || status !== "connected" || seedPrice === null) return;
    const off = conn.subscribeTicks(
      symbolCode,
      (t) => {
        setPrices((p) => ({ ...p, [t.symbol]: t.quote }));
        setCandles((cs) => {
          if (!cs.length) return cs;
          const next = cs.slice();
          const last = { ...next[next.length - 1] };
          last.close = t.quote;
          last.high = Math.max(last.high, t.quote);
          last.low = Math.min(last.low, t.quote);
          next[next.length - 1] = last;
          return next;
        });
      },
      seedPrice,
    );
    return off;
  }, [symbolCode, status, seedPrice]);

  const closePosition = useCallback((id: string, exitPrice?: number, reason?: string) => {
    setPositions((cur) => {
      const p = cur.find((x) => x.id === id);
      if (!p) return cur;
      const exit = exitPrice ?? p.entry;
      setHistory((h) => [{ ...p, exit, pnl: pnlOf(p, exit), closedAt: Date.now() }, ...h].slice(0, 100));
      if (reason) toast(`${p.label} closed — ${reason}`);
      return cur.filter((x) => x.id !== id);
    });
  }, []);

  // SL / TP monitor
  useEffect(() => {
    positions.forEach((p) => {
      const cur = prices[p.symbol];
      if (!cur) return;
      const hitTp = p.side === "BUY" ? cur >= p.takeProfit : cur <= p.takeProfit;
      const hitSl = p.side === "BUY" ? cur <= p.stopLoss : cur >= p.stopLoss;
      if (hitTp) closePosition(p.id, p.takeProfit, "take profit hit");
      else if (hitSl) closePosition(p.id, p.stopLoss, "stop loss hit");
    });
  }, [prices, positions, closePosition]);

  function runAnalysis() {
    if (!candles.length) return;
    setAnalyzing(true);
    setTimeout(() => {
      setAnalysis(analyzeMarket(candles, price));
      setAnalyzing(false);
    }, 600);
  }

  async function execute(plan: ExecutionPlan) {
    const conn = connRef.current;
    if (!conn || status !== "connected") {
      toast.error("Not connected to Deriv. Check your API settings.");
      return;
    }
    const targets = plan.tripleMode ? plan.targets : [plan.targets[Math.min(1, plan.targets.length - 1)]];
    for (let i = 0; i < targets.length; i++) {
      const tp = targets[i];
      const res = await conn.placeTrade({
        symbol: symbol.code,
        side: plan.side,
        lots: plan.lots,
        entry: price,
        stopLoss: plan.stopLoss,
        takeProfit: tp,
        label: plan.tripleMode ? `TP${i + 1}` : "TP",
      });
      if (!res.ok) {
        toast.error(res.message);
        continue;
      }
      setPositions((cur) => [
        ...cur,
        {
          id: res.id,
          symbol: symbol.code,
          symbolLabel: symbol.label,
          side: plan.side,
          lots: plan.lots,
          entry: price,
          stopLoss: plan.stopLoss,
          takeProfit: tp,
          label: plan.tripleMode ? `TP${i + 1}` : "TP",
          openedAt: res.openedAt,
          pipSize: symbol.pipSize,
          pipValuePerLot: symbol.pipValuePerLot,
        },
      ]);
    }
    toast.success(`${plan.side} ${plan.lots.toFixed(2)} ${symbol.label}${plan.tripleMode ? " · triple-trade" : ""} executed`);
  }

  function closeAll() {
    positions.forEach((p) => closePosition(p.id, prices[p.symbol] ?? p.entry));
    toast("All positions closed");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <TerminalHeader status={status} account={account} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <h1 className="sr-only">PalTrade Deriv trading terminal for forex and synthetic indices</h1>

        <div className="space-y-4">
          <ChartContainer
            candles={candles}
            symbol={symbol}
            timeframe={timeframe}
            price={price}
            showFib={overlays.fib}
            showEma={overlays.ema}
            showRsi={overlays.rsi}
            onSymbolChange={setSymbolCode}
            onTimeframeChange={setTimeframe}
            onToggle={(k) => setOverlays((o) => ({ ...o, [k]: !o[k] }))}
          />
          <PositionsTable
            positions={positions}
            history={history}
            prices={prices}
            symbol={symbol}
            onClose={(id) => closePosition(id, prices[symbolCode])}
            onCloseAll={closeAll}
          />
        </div>

        <StrategyPanel
          symbol={symbol}
          price={price}
          balance={account?.balance ?? 10000}
          analysis={analysis}
          analyzing={analyzing}
          tripleMode={tripleMode}
          onToggleTriple={setTripleMode}
          onAnalyze={runAnalysis}
          onExecute={execute}
        />
      </main>

      <SettingsModal
        open={settingsOpen}
        values={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={(v) => {
          setSettings(v);
          setSettingsOpen(false);
          toast.success("Settings saved — reconnecting to Deriv");
        }}
      />
    </div>
  );
}
