/**
 * useBackendTicks.ts
 *
 * Connects to the hosted PalTrade FastAPI backend WebSocket endpoint:
 *   wss://<VITE_BACKEND_URL>/ws/ticks/{symbol}
 *
 * The backend maintains a single upstream Deriv WebSocket per symbol and
 * fans the raw tick JSON out to every connected browser client.
 *
 * Usage:
 *   const { latestTick, connected } = useBackendTicks("frxXAUUSD", token);
 *
 * The `token` parameter is optional — the backend streams public ticks
 * without authentication. Pass the Deriv OAuth token for account-level
 * data (balance, portfolio) once the session is established.
 */
import { useEffect, useRef, useState } from "react";

/** Raw tick frame forwarded from the Deriv WebSocket by the backend */
export interface DerivTickFrame {
  msg_type: string;
  tick?: {
    symbol: string;
    epoch: number;
    quote: number;
    bid?: number;
    ask?: number;
    pip_size?: number;
  };
  error?: { code: string; message: string };
}

export interface UseBackendTicksResult {
  latestTick: DerivTickFrame["tick"] | null;
  connected: boolean;
  error: string | null;
}

function getBackendWsUrl(): string {
  const raw =
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_BACKEND_URL ?? "";
  // Convert http(s) → ws(s); strip trailing slash
  const base = raw.replace(/^http/, "ws").replace(/\/+$/, "");
  return base || "wss://paltrade-terminal.onrender.com";
}

export function useBackendTicks(
  symbol: string,
  _token?: string,
): UseBackendTicksResult {
  const [latestTick, setLatestTick] = useState<DerivTickFrame["tick"] | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let retryCount = 0;

    function connect() {
      if (!mountedRef.current) return;
      const url = `${getBackendWsUrl()}/ws/ticks/${encodeURIComponent(symbol)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCount = 0;
        setConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const frame = JSON.parse(event.data) as DerivTickFrame;
          if (frame.msg_type === "tick" && frame.tick) {
            setLatestTick(frame.tick);
          }
          if (frame.error) {
            setError(frame.error.message);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        setError("Backend WebSocket error — retrying…");
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        // Exponential back-off: 2s, 4s, 8s … capped at 30s
        const delay = Math.min(2000 * Math.pow(2, retryCount), 30_000);
        retryCount++;
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [symbol]);

  return { latestTick, connected, error };
}
