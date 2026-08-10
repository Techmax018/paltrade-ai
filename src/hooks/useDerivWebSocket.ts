import { useEffect, useMemo, useState } from "react";
import { connectWebSocket, validateAppId } from "@/lib/derivApi";
import type { DerivConnection, ConnectionStatus } from "@/lib/derivApi";

interface HookOpts {
  appId?: string | number;
  token?: string;
  accountType?: "demo" | "real";
}

export function useDerivWebSocket(opts: HookOpts) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [connection, setConnection] = useState<DerivConnection | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const validatedAppId = useMemo(() => validateAppId(opts.appId), [opts.appId]);

  useEffect(() => {
    if (!validatedAppId) {
      const invalidValue = opts.appId ?? "(unset)";
      setErrorMessage(
        `Invalid Deriv app_id provided: ${invalidValue}. Please set VITE_DERIV_APP_ID to a numeric app id such as 1089.`,
      );
      setStatus("error");
      setConnection(null);
      return;
    }

    setErrorMessage(null);
    setStatus("connecting");

    const conn = connectWebSocket({
      appId: validatedAppId,
      token: opts.token,
      accountType: opts.accountType ?? "demo",
    });
    setConnection(conn);

    const offStatus = conn.onStatus((s) => setStatus(s));

    return () => {
      offStatus();
      try {
        conn.disconnect();
      } catch (err) {
        console.warn("Error disconnecting Deriv connection on unmount", err);
      }
      setConnection(null);
    };
  }, [validatedAppId, opts.token, opts.accountType]);

  function safeSend(payload: Record<string, unknown>) {
    if (!connection) {
      console.warn("Cannot send over Deriv WebSocket: no active connection.");
      return;
    }
    try {
      (connection as any).send?.(payload);
    } catch (err) {
      console.warn("safeSend failed", err);
    }
  }

  return {
    status,
    connection,
    errorMessage,
    safeSend,
  } as const;
}
