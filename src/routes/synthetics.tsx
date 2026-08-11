import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Bolt, Clock, Flame, LineChart, ShieldAlert, Waves } from "lucide-react";
import { getOrigin } from "../lib/og";

export const Route = createFileRoute("/synthetics")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const url = `${origin}/synthetics`;
    const img = `${origin}/og-home.jpg`;
    return {
      meta: [
        { title: "Synthetic Indices Trading Guide — PalTrade" },
        {
          name: "description",
          content:
            "Trade synthetic indices 24/7: Volatility, Crash & Boom, Jump and Step indices explained with tick speed, typical strategies and risk settings.",
        },
        { property: "og:title", content: "Synthetic Indices Trading — PalTrade" },
        {
          property: "og:description",
          content:
            "Volatility, Crash & Boom, Jump and Step indices explained — behaviour, best strategies, lot sizing and 24/7 session notes.",
        },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: img },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SyntheticsPage,
});

type Family = "volatility" | "crashboom" | "jump" | "step";

interface SynthIndex {
  name: string;
  family: Family;
  tick: string;
  vol: number; // 1-5 relative
  behaviour: string;
  strategy: string;
  risk: string;
}

const FAMILIES: { id: Family | "all"; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "All indices", icon: <Activity className="h-3.5 w-3.5" /> },
  { id: "volatility", label: "Volatility", icon: <Waves className="h-3.5 w-3.5" /> },
  { id: "crashboom", label: "Crash & Boom", icon: <Flame className="h-3.5 w-3.5" /> },
  { id: "jump", label: "Jump", icon: <Bolt className="h-3.5 w-3.5" /> },
  { id: "step", label: "Step", icon: <LineChart className="h-3.5 w-3.5" /> },
];

const INDICES: SynthIndex[] = [
  {
    name: "Volatility 10 Index",
    family: "volatility",
    tick: "2s",
    vol: 1,
    behaviour: "Smoothest of the family — clean trends, shallow pullbacks, small ranges.",
    strategy: "Trend continuation on EMA pullbacks; scalping ranges on M1–M5.",
    risk: "Tight stops work here. Keep risk at 1% and avoid over-leveraging the small range.",
  },
  {
    name: "Volatility 25 Index",
    family: "volatility",
    tick: "2s",
    vol: 2,
    behaviour: "Moderate swings with respectable respect for support/resistance.",
    strategy: "Break-and-retest at session highs/lows; RSI reversal at extremes.",
    risk: "Stops of 1.5x the recent M15 range; 1% risk per trade.",
  },
  {
    name: "Volatility 50 Index",
    family: "volatility",
    tick: "2s",
    vol: 3,
    behaviour: "Balanced mid-range volatility — the usual starting point for beginners.",
    strategy: "Structure trading: BOS then fair-value-gap retest.",
    risk: "Wider stops than V10/V25; size down so the dollar risk stays fixed.",
  },
  {
    name: "Volatility 75 Index",
    family: "volatility",
    tick: "2s",
    vol: 4,
    behaviour: "The classic 'V75' — long impulsive legs, deep retracements, big candles.",
    strategy: "Trend continuation from 0.618–0.786 fib; avoid counter-trend scalps.",
    risk: "Micro lots only for small accounts. A single candle can exceed a tight stop.",
  },
  {
    name: "Volatility 100 Index",
    family: "volatility",
    tick: "2s",
    vol: 5,
    behaviour: "Highest constant volatility — fast expansion in both directions.",
    strategy: "Higher-timeframe bias (H1) with M5 entries; wide stop, high R targets.",
    risk: "Halve your normal position size. Never martingale this one.",
  },
  {
    name: "Volatility 75 (1s) Index",
    family: "volatility",
    tick: "1s",
    vol: 5,
    behaviour: "Same profile as V75 but ticks every second — four times the bar count.",
    strategy: "Intraday scalping on M1 with strict session limits.",
    risk: "Over-trading is the main danger. Cap daily trades and stop after 2 losses.",
  },
  {
    name: "Crash 500 Index",
    family: "crashboom",
    tick: "1s",
    vol: 4,
    behaviour: "Drifts upward, then drops sharply on average once every 500 ticks.",
    strategy: "Buy the drift with trailing stops; only sell into a confirmed spike.",
    risk: "Never hold a naked buy through a spike window without a stop.",
  },
  {
    name: "Crash 1000 Index",
    family: "crashboom",
    tick: "1s",
    vol: 3,
    behaviour: "Same as Crash 500 but the average spike arrives every 1000 ticks.",
    strategy: "Longer drift rides; spike-catching with fixed small risk per attempt.",
    risk: "Spike hunting has a low hit rate — budget for consecutive small losses.",
  },
  {
    name: "Boom 500 Index",
    family: "crashboom",
    tick: "1s",
    vol: 4,
    behaviour: "Drifts downward, then spikes upward roughly every 500 ticks.",
    strategy: "Sell the drift; buy only on confirmed spike momentum.",
    risk: "Mirror of Crash — an unstopped short can be wiped by one spike.",
  },
  {
    name: "Boom 1000 Index",
    family: "crashboom",
    tick: "1s",
    vol: 3,
    behaviour: "Slower drift, larger and rarer upward spikes.",
    strategy: "Drift shorts on M5 with trailing stop under swing highs.",
    risk: "Keep stops above the last spike wick, not at round numbers.",
  },
  {
    name: "Jump 25 / 50 Index",
    family: "jump",
    tick: "1s",
    vol: 3,
    behaviour: "Regular volatility punctuated by jumps roughly three times an hour.",
    strategy: "Trade the post-jump continuation; skip the minutes around a jump.",
    risk: "Gaps skip stops — use guaranteed distance, not 5-pip stops.",
  },
  {
    name: "Jump 75 / 100 Index",
    family: "jump",
    tick: "1s",
    vol: 5,
    behaviour: "High baseline volatility plus scheduled jumps — very expansive.",
    strategy: "Higher-timeframe breakouts only; ignore intrabar noise.",
    risk: "Smallest size of any family. Treat every position as gap-exposed.",
  },
  {
    name: "Step Index",
    family: "step",
    tick: "1s",
    vol: 2,
    behaviour: "Moves in fixed-size steps with equal probability up or down.",
    strategy: "Range and mean-reversion systems; grid-free counter-trend fades.",
    risk: "Predictable step size makes stop placement mechanical — use it.",
  },
  {
    name: "Range Break 100 / 200",
    family: "step",
    tick: "1s",
    vol: 3,
    behaviour: "Consolidates inside a range, then breaks out on average every 100/200 ranges.",
    strategy: "Range fade until the break, then momentum continuation.",
    risk: "Do not fade a confirmed break — flip with it or stand aside.",
  },
];

const PLAYBOOK = [
  {
    title: "1. Pick one index and learn it",
    body: "Synthetic indices each have a fixed statistical personality. Trading five of them badly beats nothing; trading one of them well beats everything. Start with Volatility 50 or Step Index.",
  },
  {
    title: "2. Fix your risk before your entry",
    body: "1% of balance per trade, stop-loss placed at structure — not at a round number. Use the lot size calculator to convert that into micro lots.",
  },
  {
    title: "3. Trade with the higher-timeframe bias",
    body: "Read H1 for direction, M15 for the level, M5 for the trigger. If the three disagree, there is no trade.",
  },
  {
    title: "4. Respect the spike mechanics",
    body: "Crash, Boom and Jump indices move against drift traders violently. A stop-loss is not optional on those markets.",
  },
  {
    title: "5. Journal every trade",
    body: "24/7 markets remove the natural stop of a closing bell. A daily trade cap and a written log are what replace it.",
  },
];

function VolMeter({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`Volatility ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-3 w-1 rounded-sm ${i <= level ? "bg-signal" : "bg-muted"}`}
        />
      ))}
    </span>
  );
}

function SyntheticsPage() {
  const [family, setFamily] = useState<Family | "all">("all");
  const list = useMemo(
    () => (family === "all" ? INDICES : INDICES.filter((i) => i.family === family)),
    [family],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="text-lg font-black tracking-tight">
            Pal<span className="text-signal">Trade</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <Link to="/terminal" className="hover:text-foreground">Terminal</Link>
            <Link to="/backtest" className="hover:text-foreground">Backtest</Link>
            <Link to="/calculator" className="hover:text-foreground">Calculator</Link>
            <Link to="/brokers" className="hover:text-foreground">Brokers</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/40 bg-signal/10 px-3 py-1 text-xs font-semibold text-signal">
            <Clock className="h-3.5 w-3.5" /> Markets open 24/7, weekends included
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
            Synthetic indices trading
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Synthetic indices are broker-generated markets driven by a cryptographically secure random
            number generator. There is no news, no central bank and no liquidity gap — only a fixed,
            published volatility profile. That makes them the cleanest place to practise structure,
            risk and discipline. Below is the behaviour of each family and the strategy that fits it.
          </p>
        </section>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {FAMILIES.map((f) => (
            <button
              key={f.id}
              onClick={() => setFamily(f.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                family === f.id
                  ? "border-signal/50 bg-signal/15 text-signal"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>

        {/* Index grid */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((idx) => (
            <article
              key={idx.name}
              className="rounded-xl border border-border/60 bg-card/70 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-bold">{idx.name}</h2>
                <VolMeter level={idx.vol} />
              </div>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {idx.tick} ticks
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{idx.behaviour}</p>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="font-semibold text-foreground">Best-fit strategy</dt>
                  <dd className="text-muted-foreground">{idx.strategy}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">Risk note</dt>
                  <dd className="text-muted-foreground">{idx.risk}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>

        {/* Playbook */}
        <section className="mt-14">
          <h2 className="text-xl font-bold tracking-tight">The synthetic trading playbook</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {PLAYBOOK.map((p) => (
              <div key={p.title} className="rounded-xl border border-border/60 bg-card/50 p-4">
                <h3 className="text-sm font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14 rounded-2xl border border-signal/30 bg-signal/5 p-6 text-center">
          <h2 className="text-lg font-bold">Put it to work</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Load a synthetic index in the terminal, let the AI advisor pick the best-fit strategy and
            timing, then size the trade with the calculator before you click buy.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/terminal"
              className="rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-background"
            >
              Open the terminal
            </Link>
            <Link
              to="/backtest"
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-card"
            >
              Backtest a rule
            </Link>
          </div>
        </section>

        <p className="mt-10 flex items-start gap-2 rounded-lg border border-bear/30 bg-bear/5 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-bear" />
          Educational content only, not financial advice. Synthetic indices are leveraged products —
          you can lose more than you expect. Trade a demo account until your process is profitable.
        </p>
      </main>
    </div>
  );
}
