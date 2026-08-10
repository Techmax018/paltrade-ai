/**
 * Deriv OAuth2 callback — receives ?code=&state=, verifies state and exchanges
 * the code for an access token via the backend, then returns to the terminal.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeDerivOAuth, startDerivLogin } from "@/hooks/useDerivOAuth";
import { PaltradeLoader } from "@/components/PaltradeLoader";

export const Route = createFileRoute("/auth/deriv/callback")({
  head: () => ({
    meta: [
      { title: "Connecting Deriv — PalTrade" },
      { name: "description", content: "Completing your secure Deriv OAuth 2.0 sign-in with PalTrade." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DerivCallbackPage,
});

function DerivCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    completeDerivOAuth(window.location.search)
      .then(() => {
        if (!cancelled) navigate({ to: "/terminal" });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Authentication failed.");
      });
    return () => { cancelled = true; };
  }, [navigate]);

  if (!error) return <PaltradeLoader visible message="Completing Deriv sign-in…" />;

  return (
    <div className="flex min-h-screen items-center justify-center px-6" style={{ background: "#020617" }}>
      <div className="w-full max-w-sm rounded-2xl border p-6 text-center"
        style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.05)" }}>
        <h1 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
          Deriv sign-in failed
        </h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(148,163,184,0.8)" }}>{error}</p>
        <button
          onClick={() => { void startDerivLogin(); }}
          className="mt-5 w-full rounded-lg py-2.5 text-sm font-semibold"
          style={{ background: "linear-gradient(90deg,#0284c7,#06b6d4)", color: "#fff" }}
        >
          Try again
        </button>
        <button
          onClick={() => navigate({ to: "/login" })}
          className="mt-2 w-full text-xs hover:underline"
          style={{ color: "rgba(100,116,139,0.7)" }}
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
