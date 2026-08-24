import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, ShieldCheck, Target, DollarSign } from "lucide-react";
import { getOrigin } from "../lib/og";

export const Route = createFileRoute("/calculator")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const url = `${origin}/calculator`;
    const img = `${origin}/og-home.jpg`;
    return {
      meta: [
        { title: "Lot Size Calculator — PalTrade" },
        {
          name: "description",
          content:
            "Estimate forex position size from account balance, risk %, stop-loss in pips, and pip value. Trade with disciplined risk.",
        },
        { property: "og:title", content: "Lot Size Calculator — PalTrade" },
        {
          property: "og:description",
          content:
            "Free forex position size calculator: balance, risk %, stop-loss, pip value → lots.",
        },
        { property: "og:url", content: url },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CalculatorPage,
});

// Standard pip value per 1.00 standard lot (100,000 units) in USD for common pairs.
// For JPY quote pairs, 1 pip = 0.01; otherwise 1 pip = 0.0001. Values assume USD account.
const PIP_VALUE_PER_LOT: Record<string, number> = {
  "EUR/USD": 10,
  "GBP/USD": 10,
  "AUD/USD": 10,
  "NZD/USD": 10,
  "USD/CAD": 10, // approximation; actual varies with USD/CAD rate
  "USD/CHF": 10, // approximation
  "USD/JPY": 10, // approximation at ~150 JPY
  "XAU/USD": 10, // per $0.10 move per 1 oz; treated as pip = $0.10
};

function CalculatorPage() {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [stopPips, setStopPips] = useState(25);
  const [pair, setPair] = useState<keyof typeof PIP_VALUE_PER_LOT>("EUR/USD");
  const [pipValueOverride, setPipValueOverride] = useState<string>("");

  const pipValuePerLot = useMemo(() => {
    const parsed = parseFloat(pipValueOverride);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return PIP_VALUE_PER_LOT[pair];
  }, [pair, pipValueOverride]);

  const results = useMemo(() => {
    const riskAmount = (balance * riskPct) / 100;
    const perLotRisk = stopPips * pipValuePerLot;
    const lots = perLotRisk > 0 ? riskAmount / perLotRisk : 0;
    const units = lots * 100000;
    const standard = lots;
    const mini = lots * 10;
    const micro = lots * 100;
    return { riskAmount, lots: standard, mini, micro, units, perLotRisk };
  }, [balance, riskPct, stopPips, pipValuePerLot]);

  const fmt = (n: number, d = 2) =>
    n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-gold font-bold text-primary-foreground">
              P
            </span>
            <span className="text-lg font-semibold tracking-tight">
              pal<span className="text-primary">trade</span>
            </span>
          </Link>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <Link to="/backtest" className="hover:text-foreground">Backtest</Link>
            <Link to="/brokers" className="hover:text-foreground">Brokers</Link>
            <Link to="/calculator" className="text-foreground">Calculator</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Risk Calculator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick position sizing for a clean, disciplined trade plan.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <section className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="space-y-4">
              <Field label="Account balance (USD)">
                <input
                  type="number"
                  min={0}
                  value={balance}
                  onChange={(e) => setBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input"
                />
              </Field>

              <Field label={`Risk per trade: ${riskPct}%`}>
                <input
                  type="range"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={riskPct}
                  onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>0.5%</span>
                  <span>1%</span>
                  <span>5%</span>
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Stop-loss (pips)">
                  <input
                    type="number"
                    min={1}
                    value={stopPips}
                    onChange={(e) => setStopPips(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="input"
                  />
                </Field>

                <Field label="Pair">
                  <select
                    value={pair}
                    onChange={(e) => setPair(e.target.value as keyof typeof PIP_VALUE_PER_LOT)}
                    className="input"
                  >
                    {Object.keys(PIP_VALUE_PER_LOT).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label={`Pip value per 1.00 lot (USD) — default $${PIP_VALUE_PER_LOT[pair]}`}>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder={`${PIP_VALUE_PER_LOT[pair]}`}
                  value={pipValueOverride}
                  onChange={(e) => setPipValueOverride(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Target className="h-4 w-4" /> Recommended position
              </div>
              <div className="mt-3 text-4xl font-semibold tracking-tight">
                {fmt(results.lots, 2)} <span className="text-lg text-muted-foreground">lots</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                ≈ {fmt(results.units, 0)} units
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Standard" value={`${fmt(results.lots, 2)}`} sub="× 100k" />
              <Stat label="Mini" value={`${fmt(results.mini, 2)}`} sub="× 10k" />
              <Stat label="Micro" value={`${fmt(results.micro, 2)}`} sub="× 1k" />
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Risk summary
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row icon={<DollarSign className="h-4 w-4" />} label="At risk">${fmt(results.riskAmount)}</Row>
                <Row icon={<ShieldCheck className="h-4 w-4" />} label="Risk %">{fmt(riskPct)}%</Row>
                <Row label="Stop-loss">{stopPips} pips</Row>
                <Row label="Pip value">${fmt(pipValuePerLot)}</Row>
                <Row label="Per lot risk">${fmt(results.perLotRisk)}</Row>
                <Row label="Pair">{pair}</Row>
              </dl>
            </div>
          </section>
        </div>
      </main>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.625rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0.65rem 0.75rem;
          font-size: 0.9rem;
          color: hsl(var(--foreground));
          outline: none;
        }
        .input:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 3px hsl(var(--primary) / 0.16); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 text-center">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Row({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
