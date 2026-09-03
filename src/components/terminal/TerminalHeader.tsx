import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  Settings,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { AccountInfo, ConnectionStatus, Timeframe } from "@/lib/derivApi";

const TIMEFRAME_SECONDS: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, H1: 3600 };

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  error: "Connection error",
};

export function TerminalHeader({
  status,
  account,
  autoPilot,
  timeframe,
  onOpenSettings,
  onToggleAutoPilot,
  onOpenAutoPilotConfig,
}: {
  status: ConnectionStatus;
  account: AccountInfo | null;
  autoPilot: boolean;
  timeframe: Timeframe;
  onOpenSettings: () => void;
  onToggleAutoPilot: (v: boolean) => void;
  onOpenAutoPilotConfig: () => void;
}) {
  const tone =
    status === "connected" ? "text-profit"
    : status === "disconnected" || status === "error" ? "text-bear"
    : "text-signal";
  const ConnIcon =
    status === "connected" ? Wifi
    : status === "disconnected" || status === "error" ? WifiOff
    : RefreshCw;

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsPerCandle = TIMEFRAME_SECONDS[timeframe];
  const nextCandleRemaining = useMemo(() => {
    const nowSeconds = Math.floor(now / 1000);
    const nextBoundary = Math.ceil(nowSeconds / secondsPerCandle) * secondsPerCandle;
    const diff = Math.max(0, nextBoundary - nowSeconds);
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, [now, secondsPerCandle]);

  const monthRemaining = useMemo(() => {
    const end = new Date();
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    const diffMs = Math.max(0, end.getTime() - now);
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }, [now]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-card/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 no-scrollbar">
        <Link to="/" className="flex shrink-0 items-center gap-1.5">
          <img
            src="/android-chrome-192x192.png"
            alt="PalTrade"
            className="h-7 w-7 rounded-lg object-cover sm:h-8 sm:w-8"
          />
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">
            Pal<span className="text-signal">Trade</span>
          </span>
          <span className="hidden sm:inline rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Terminal
          </span>
        </Link>

        <div className={`flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/50 px-2 py-1 text-[11px] sm:px-3 sm:text-xs ${tone}`}>
          <ConnIcon className={`h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5 ${status === "connecting" || status === "reconnecting" ? "animate-spin" : ""}`} />
          <span className="hidden xs:inline">{STATUS_LABEL[status]}</span>
        </div>

        <button
          type="button"
          onClick={onOpenAutoPilotConfig}
          aria-label="Auto-Pilot settings"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-signal/50 hover:text-signal sm:text-[11px]"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Config</span>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-profit/30 bg-profit/10 px-2 py-1.5 text-[10px] font-semibold text-profit transition hover:bg-profit/15 sm:text-[11px]"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            BUY
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-bear/30 bg-bear/10 px-2 py-1.5 text-[10px] font-semibold text-bear transition hover:bg-bear/15 sm:text-[11px]"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            SELL
          </button>

          <div className="hidden rounded-md border border-border bg-background/50 px-2 py-1.5 sm:flex">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Next {timeframe}</div>
            <div className="ml-2 font-mono text-[11px] text-signal">{nextCandleRemaining}</div>
          </div>

          <div className="hidden rounded-md border border-border bg-background/50 px-2 py-1.5 lg:flex">
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Month left</div>
            <div className="ml-2 font-mono text-[11px] text-foreground">{monthRemaining}</div>
          </div>

          {account && (
            <div className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1.5">
              <span className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Bal</span>
              <span className="font-mono text-[11px] text-foreground">${account.balance.toFixed(0)}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1.5 text-[11px] font-medium hover:border-signal/50 hover:text-signal sm:px-3"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 border-t border-border/40 px-4 py-1 text-[10px] text-muted-foreground sm:text-[11px]">
        <Activity className="h-3 w-3 shrink-0 text-signal" />
        <span className="truncate">Deriv WebSocket · Forex & Synthetics</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px]">
          <span className="font-medium text-muted-foreground">{timeframe}</span>
          <span className="font-mono text-signal">{nextCandleRemaining}</span>
          {autoPilot && (
            <span className="flex items-center gap-1 text-profit">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-profit" />
              <span className="hidden sm:inline">Engine scanning…</span>
            </span>
          )}
        </span>
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-md border border-border bg-background/40 px-2 py-1 sm:px-3 ${className}`}>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">{label}</div>
      <div className={`font-mono text-[11px] sm:text-xs ${accent ? "text-profit" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
