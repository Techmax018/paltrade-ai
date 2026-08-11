import { useEffect, useMemo, useState } from "react";
import { connectWebSocket, validateAppId } from "@/lib/derivApi";
import type { DerivConnection, ConnectionStatus } from "@/lib/derivApi";

interface HookOpts {
  appId?: string | number;
  accountId?: string;
  token?: string;
  accountType?: "demo" | "real";
}

export function useDerivWebSocket(opts: HookOpts) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [connection, setConnection] = useState<DerivConnection | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const normalizedInput = useMemo(() => String(opts.appId ?? "").trim(), [opts.appId]);
  const validatedAppId = useMemo(
    () => (normalizedInput ? validateAppId(normalizedInput) : null),
    [normalizedInput],
  );

  useEffect(() => {
    if (!normalizedInput) {
      setErrorMessage(null);
      setStatus("disconnected");
      setConnection(null);
      return;
    }

    if (opts.token && !validatedAppId) {
      const invalidValue = opts.appId ?? "(unset)";
      setErrorMessage(
        `Invalid Deriv app_id provided: ${invalidValue}. Please set VITE_DERIV_APP_ID to a non-empty string or number.`,
      );
      setStatus("error");
      setConnection(null);
      return;
    }

    if (!validatedAppId) {
      setErrorMessage("Deriv App ID must contain digits only. Create an app in the Deriv dashboard; do not paste an API token here.");
      setStatus("error");
      setConnection(null);
      return;
    }

    setErrorMessage(null);
    setStatus("connecting");

    const conn = connectWebSocket({
      appId: validatedAppId ?? undefined,
      accountId: opts.accountId,
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
  }, [normalizedInput, validatedAppId, opts.token, opts.accountId, opts.accountType]);

  function safeSend(payload: Record<string, unknown>) {
    if (!connection) {
      console.warn("Cannot send over Deriv WebSocket: no active connection.");
      return;
    }
    const sendable = connection as unknown as { send?: (payload: Record<string, unknown>) => void };
    if (typeof sendable.send !== "function") {
      console.warn("Cannot send over Deriv WebSocket: connection is not sendable.");
      return;
    }
    try {
      sendable.send(payload);
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
