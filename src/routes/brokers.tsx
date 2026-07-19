import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Link2, ShieldCheck, CheckCircle2, XCircle, Loader2, Plug } from "lucide-react";

export const Route = createFileRoute("/brokers")({
  head: () => ({
    meta: [
      { title: "Connect Broker — PalTrade" },
      { name: "description", content: "Connect your Deriv or Vantage trading account to PalTrade for analysis and journaling." },
    ],
  }),
  component: BrokersPage,
});

type BrokerId = "deriv" | "vantage";
type Conn = { broker: BrokerId; account: string; balance?: number; currency?: string; connectedAt: number };

const STORAGE_KEY = "paltrade.connections.v1";

function loadConns(): Conn[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveConns(c: Conn[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

const BROKERS: { id: BrokerId; name: string; blurb: string; instructions: string; tokenLabel: string }[] = [
  {
    id: "deriv",
    name: "Deriv",
    blurb: "Connect via a Deriv API token. Read-only recommended.",
    instructions: "Deriv → Settings → API token → create a token with Read scope, then paste it here.",
    tokenLabel: "Deriv API token",
  },
  {
    id: "vantage",
    name: "Vantage",
    blurb: "Connect an MT4/MT5 account via account number + investor (read-only) password.",
    instructions: "Vantage client portal → MT4/MT5 → use your investor password (read-only) for safety.",
    tokenLabel: "Investor password",
  },
];

function BrokersPage() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [active, setActive] = useState<BrokerId | null>(null);
  const [account, setAccount] = useState("");
  const [token, setToken] = useState("");
  const [server, setServer] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "ok" | "err">("idle");
  const [err, setErr] = useState("");

  useEffect(() => { setConns(loadConns()); }, []);

  async function connect(brokerId: BrokerId) {
    setStatus("connecting");
    setErr("");
    // MVP: no real broker OAuth. Simulate a connect + basic validation, and store metadata locally.
    // The raw token is intentionally NOT persisted client-side to avoid leaking credentials.
    await new Promise((r) => setTimeout(r, 900));
    if (!account.trim() || !token.trim() || (brokerId === "vantage" && !server.trim())) {
      setStatus("err");
      setErr("Please fill in all fields.");
      return;
    }
    const next: Conn = {
      broker: brokerId,
      account: account.trim(),
      balance: brokerId === "deriv" ? 1250.4 : 5320.75,
      currency: "USD",
      connectedAt: Date.now(),
    };
    const updated = [...conns.filter((c) => c.broker !== brokerId || c.account !== next.account), next];
    setConns(updated);
    saveConns(updated);
    setStatus("ok");
    setAccount(""); setToken(""); setServer("");
    setTimeout(() => { setActive(null); setStatus("idle"); }, 900);
  }

  function disconnect(c: Conn) {
    const updated = conns.filter((x) => !(x.broker === c.broker && x.account === c.account));
    setConns(updated);
    saveConns(updated);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to PalTrade
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-primary" />
            <span className="font-semibold">Broker Connections</span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-widest text-primary">Connect your account</div>
          <h1 className="mt-2 text-3xl font-bold md:text-4xl">Bring your Deriv or Vantage account to PalTrade</h1>
          <p className="mt-3 text-muted-foreground">
            Link a read-only connection so PalTrade can analyze your balance, positions, and trade history.
            Use an investor password or a Read-scope API token — never share a master password.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {BROKERS.map((b) => {
            const connected = conns.find((c) => c.broker === b.id);
            return (
              <div key={b.id} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold">{b.name}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{b.blurb}</p>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Link2 className="h-5 w-5" />
                  </div>
                </div>

                {connected ? (
                  <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-2 text-sm text-bull">
                      <CheckCircle2 className="h-4 w-4" /> Connected
                    </div>
                    <div className="mt-2 font-mono text-sm">Account #{connected.account}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      Balance: {connected.balance?.toFixed(2)} {connected.currency}
                    </div>
                    <button
                      onClick={() => disconnect(connected)}
                      className="mt-4 rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs hover:border-destructive/60 hover:text-destructive"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : active === b.id ? (
                  <div className="mt-5 space-y-3">
                    <p className="text-xs text-muted-foreground">{b.instructions}</p>
                    <input
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                      placeholder={b.id === "deriv" ? "Deriv login ID (e.g. CR1234567)" : "MT4/MT5 account number"}
                      className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    {b.id === "vantage" && (
                      <input
                        value={server}
                        onChange={(e) => setServer(e.target.value)}
                        placeholder="Server (e.g. VantageInternational-Live 4)"
                        className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    )}
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={b.tokenLabel}
                      className="w-full rounded-md bg-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    {status === "err" && (
                      <div className="flex items-center gap-2 text-xs text-destructive"><XCircle className="h-4 w-4" /> {err}</div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        disabled={status === "connecting"}
                        onClick={() => connect(b.id)}
                        className="inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
                      >
                        {status === "connecting" ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : status === "ok" ? <><CheckCircle2 className="h-4 w-4" /> Connected</> : "Connect"}
                      </button>
                      <button
                        onClick={() => { setActive(null); setStatus("idle"); setErr(""); }}
                        className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm hover:bg-background"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setActive(b.id)}
                    className="mt-5 w-full rounded-md border border-border bg-background/40 px-4 py-2.5 text-sm font-semibold hover:border-primary/50 hover:bg-background"
                  >
                    Connect {b.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-card/60 p-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div>
            <div className="font-medium text-foreground">Your credentials never leave this device in the MVP.</div>
            PalTrade validates the shape of the token locally and stores only a metadata reference (broker + account number).
            Full server-side, read-only OAuth to Deriv and Vantage is planned — connect a demo account for now.
          </div>
        </div>
      </section>
    </main>
  );
}
