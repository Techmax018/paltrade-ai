import { useEffect, useRef, useState } from "react";
import { connectWebSocket } from "@/lib/derivApi";
import type { DerivConnection, ConnectionStatus } from "@/lib/derivApi";

interface HookOpts {
  appId?: string | number;
  token?: string;
  accountType?: "demo" | "real";
}

export function useDerivWebSocket(opts: HookOpts) {
  const connRef = useRef<DerivConnection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    let mounted = true;
    setStatus("connecting");

    // Create a connection instance; connectWebSocket will pick mock if no valid appId
    const conn = connectWebSocket({ appId: opts.appId, token: opts.token, accountType: opts.accountType ?? "demo" });
    connRef.current = conn;

    // subscribe to status updates
    const un = conn.onStatus((s) => {
      if (!mounted) return;
      setStatus(s);
    });

    // Clean-up: disconnect only once when component unmounts
    return () => {
      mounted = false;
      try {
        un();
      } catch {}
      try {
        conn.disconnect();
      } catch (err) {
        console.warn("Error disconnecting Deriv connection on unmount", err);
      }
      connRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.appId, opts.token]);

  // Safe send helper
  function safeSend(payload: Record<string, unknown>) {
    const c = connRef.current;
    try {
      if (c) {
        // rely on connection to guard send
        (c as any).send?.(payload);
      }
    } catch (err) {
      console.warn("safeSend failed", err);
    }
  }

  return {
    status,
    connection: connRef.current,
    safeSend,
  } as const;
}
