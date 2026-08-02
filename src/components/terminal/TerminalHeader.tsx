import { Link } from "@tanstack/react-router";
import { Activity, Settings, Wifi, WifiOff, RefreshCw, CandlestickChart } from "lucide-react";
import type { AccountInfo, ConnectionStatus } from "@/lib/derivApi";

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
  onOpenSettings,
}: {
  status: ConnectionStatus;
  account: AccountInfo | null;
  onOpenSettings: () => void;
}) {
  const tone =
    status === "connected" ? "text-profit" : status === "disconnected" || status === "error" ? "text-bear" : "text-signal";
  const Icon = status === "connected" ? Wifi : status === "disconnected" || status === "error" ? WifiOff : RefreshCw;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-card/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-signal/15 text-signal">
            <CandlestickChart className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold tracking-tight">
            Pal<span className="text-signal">Trade</span>
            <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Terminal
            </span>
          </span>
        </Link>

        <div className={`flex items-center gap-1.5 rounded-full border border-border bg-background/50 px-3 py-1 text-xs ${tone}`}>
          <Icon className={`h-3.5 w-3.5 ${status === "connecting" || status === "reconnecting" ? "animate-spin" : ""}`} />
          {STATUS_LABEL[status]}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {account && (
            <>
              <Stat label="Account" value={`${account.loginid} · ${account.accountType.toUpperCase()}`} />
              <Stat label="Balance" value={`${account.balance.toFixed(2)} ${account.currency}`} />
              <Stat label="Equity" value={`${account.equity.toFixed(2)} ${account.currency}`} accent />
              <Stat label="Leverage" value={`1:${account.leverage}`} />
            </>
          )}
          <button
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-3 py-1.5 text-xs font-medium hover:border-signal/50 hover:text-signal"
          >
            <Settings className="h-3.5 w-3.5" /> API Settings
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-border/40 px-4 py-1.5 text-[11px] text-muted-foreground">
        <Activity className="h-3 w-3 text-signal" />
        Deriv WebSocket feed · Forex & Synthetic Indices
      </div>
    </header>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-xs ${accent ? "text-profit" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
