import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  GraduationCap,
  LineChart,
  Sparkles,
  ShieldCheck,
  Send,
  Loader2,
  BookOpen,
  Target,
  Zap,
} from "lucide-react";

import { getOrigin } from "../lib/og";

export const Route = createFileRoute("/")({
  loader: async () => ({ origin: await getOrigin() }),
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? "";
    const url = `${origin}/`;
    const img = `${origin}/og-home.jpg`;
    return {
      meta: [
        { title: "PalTrade — Forex Analysis, Classes & AI Mentor" },
        {
          name: "description",
          content:
            "Learn forex from zero with beginner classes, live-style market analysis, a backtesting lab, a lot size calculator, and an AI mentor — all in one dark, focused workspace.",
        },
        { property: "og:title", content: "PalTrade — Forex Analysis, Classes & AI Mentor" },
        {
          property: "og:description",
          content:
            "Beginner forex classes, market analysis, strategy backtesting, and an AI mentor in one dark workspace.",
        },
        { property: "og:url", content: url },
        { property: "og:image", content: img },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "PalTrade — Forex Analysis & AI Mentor" },
        { name: "twitter:image", content: img },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: Home,
});

type Pair = { symbol: string; price: string; change: number };
const PAIRS: Pair[] = [
  { symbol: "EUR/USD", price: "1.0872", change: 0.24 },
  { symbol: "GBP/USD", price: "1.2691", change: -0.13 },
  { symbol: "USD/JPY", price: "156.42", change: 0.41 },
  { symbol: "AUD/USD", price: "0.6584", change: -0.22 },
  { symbol: "USD/CAD", price: "1.3712", change: 0.08 },
  { symbol: "XAU/USD", price: "2358.10", change: 0.62 },
  { symbol: "USD/CHF", price: "0.9045", change: -0.05 },
  { symbol: "NZD/USD", price: "0.6021", change: 0.17 },
];

const CLASSES = [
  {
    level: "Module 01 · Beginner",
    title: "Forex Foundations",
    desc: "Currencies, pips, lots, spreads, and how the FX market actually moves.",
    lessons: 8,
    icon: BookOpen,
  },
  {
    level: "Module 02 · Beginner",
    title: "Reading the Charts",
    desc: "Candlesticks, timeframes, support & resistance — your first chart read.",
    lessons: 10,
    icon: LineChart,
  },
  {
    level: "Module 03 · Beginner+",
    title: "Risk Management 101",
    desc: "Position sizing, stop-loss placement, and the 1% rule that keeps you alive.",
    lessons: 6,
    icon: ShieldCheck,
  },
  {
    level: "Module 04 · Intermediate",
    title: "Trend & Momentum",
    desc: "Moving averages, RSI, and MACD used together in a real setup.",
    lessons: 9,
    icon: TrendingUp,
  },
  {
    level: "Module 05 · Intermediate",
    title: "Fundamentals & News",
    desc: "Central banks, CPI, NFP — trade the calendar, not the headlines.",
    lessons: 7,
    icon: Target,
  },
  {
    level: "Module 06 · Practical",
    title: "Building a Trading Plan",
    desc: "Turn your edge into rules. Journal, review, and iterate every week.",
    lessons: 5,
    icon: Zap,
  },
];

type ChatMsg = { role: "user" | "assistant"; content: string };

function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Ticker />
      <MarketSnapshot />
      <Classes />
      <AIMentor />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <a href="#top" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gold font-bold text-primary-foreground">P</span>
          <span className="text-lg font-semibold tracking-tight">
            pal<span className="text-primary">trade</span>
          </span>
        </a>
        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <a href="#markets" className="hover:text-foreground">Markets</a>
          <a href="#classes" className="hover:text-foreground">Classes</a>
          <Link to="/backtest" className="hover:text-foreground">Backtest</Link>
          <Link to="/brokers" className="hover:text-foreground">Brokers</Link>
          <Link to="/calculator" className="hover:text-foreground">Calculator</Link>
          <a href="#mentor" className="hover:text-foreground">AI Mentor</a>
        </nav>
        <Link
          to="/brokers"
          className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
        >
          Connect broker
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="bg-hero border-b border-border/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:py-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-guided forex training
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-6xl">
            Trade forex with a <span className="text-primary">mentor</span> in your pocket.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            PalTrade combines beginner-friendly classes, market analysis, and an AI trading mentor —
            so you learn the craft without blowing an account.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#classes" className="rounded-md bg-gold px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow">
              Browse classes
            </a>
            <a href="#mentor" className="rounded-md border border-border bg-card/50 px-5 py-3 text-sm font-semibold hover:bg-card">
              Ask the AI mentor
            </a>
          </div>
          <div className="mt-10 flex gap-8 text-sm">
            <Stat label="Lessons" value="45+" />
            <Stat label="Pairs tracked" value="28" />
            <Stat label="AI mentor" value="24/7" />
          </div>
        </div>
        <ChartCard />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function ChartCard() {
  const bars = [40, 55, 48, 62, 58, 70, 65, 78, 72, 84, 80, 92];
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">EUR/USD · H1</div>
          <div className="mt-1 font-mono text-3xl font-semibold">1.0872</div>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-accent/15 px-2 py-1 text-sm font-mono text-bull">
          <TrendingUp className="h-4 w-4" /> +0.24%
        </div>
      </div>
      <div className="mt-6 flex h-40 items-end gap-1.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: `${h}%`,
              background: i === bars.length - 1
                ? "var(--gradient-gold)"
                : "linear-gradient(180deg, oklch(0.72 0.18 155 / 0.9), oklch(0.72 0.18 155 / 0.2))",
            }}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-mono text-muted-foreground">
        <div className="rounded-md bg-muted/50 py-2">H 1.0891</div>
        <div className="rounded-md bg-muted/50 py-2">L 1.0854</div>
        <div className="rounded-md bg-muted/50 py-2">Vol 128k</div>
      </div>
    </div>
  );
}

function Ticker() {
  const items = [...PAIRS, ...PAIRS];
  return (
    <div className="overflow-hidden border-b border-border/60 bg-card/30 py-3">
      <div className="flex w-max animate-ticker gap-8 whitespace-nowrap font-mono text-sm">
        {items.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-muted-foreground">{p.symbol}</span>
            <span className="text-foreground">{p.price}</span>
            <span className={p.change >= 0 ? "text-bull" : "text-bear"}>
              {p.change >= 0 ? "▲" : "▼"} {Math.abs(p.change).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketSnapshot() {
  return (
    <section id="markets" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHead
        eyebrow="Markets"
        title="Live-style market snapshot"
        desc="Track the majors and metals at a glance. Click a pair to ask the AI mentor for a breakdown."
      />
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PAIRS.map((p) => (
          <div key={p.symbol} className="rounded-xl border border-border bg-card p-4 shadow-card transition hover:border-primary/50">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-muted-foreground">{p.symbol}</span>
              {p.change >= 0 ? (
                <TrendingUp className="h-4 w-4 text-bull" />
              ) : (
                <TrendingDown className="h-4 w-4 text-bear" />
              )}
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold">{p.price}</div>
            <div className={`mt-1 font-mono text-sm ${p.change >= 0 ? "text-bull" : "text-bear"}`}>
              {p.change >= 0 ? "+" : ""}{p.change.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Classes() {
  return (
    <section id="classes" className="border-y border-border/60 bg-card/30">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHead
          eyebrow="Classes for beginners"
          title="Start from zero. Trade with a plan."
          desc="Six focused modules take you from your first candlestick to a working trading plan."
          icon={GraduationCap}
        />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CLASSES.map((c) => {
            const Icon = c.icon;
            return (
              <article key={c.title} className="group rounded-xl border border-border bg-card p-6 shadow-card transition hover:-translate-y-0.5 hover:border-primary/50">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">{c.level}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
                <div className="mt-5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{c.lessons} lessons</span>
                  <span className="text-primary group-hover:underline">Start →</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AIMentor() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm your PalTrade AI mentor. Ask me anything: 'What's a pip?', 'How do I read EUR/USD?', or 'Explain risk management for a $500 account'.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { reply: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "…" }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Mentor is temporarily unavailable. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    "What is a pip and how is it calculated?",
    "Explain risk management for a $500 account",
    "How do I read a EUR/USD chart?",
    "What moves the forex market on NFP day?",
  ];

  return (
    <section id="mentor" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHead
        eyebrow="AI Mentor"
        title="Ask, learn, then trade with a plan"
        desc="Powered by AI — trained to teach forex, not to predict prices. No financial advice."
        icon={Sparkles}
      />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3 text-sm">
            <span className="h-2 w-2 animate-pulse-glow rounded-full bg-accent" />
            <span className="font-medium">PalTrade AI</span>
            <span className="text-muted-foreground">· online</span>
          </div>
          <div ref={scrollRef} className="h-96 space-y-4 overflow-y-auto p-5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-gold text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Mentor is thinking…
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-border/60 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about pips, risk, chart patterns…"
              aria-label="Ask the PalTrade AI mentor"
              className="flex-1 rounded-md bg-input px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="grid h-11 w-11 place-items-center rounded-md bg-gold text-primary-foreground shadow-glow transition disabled:opacity-50"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-4 shadow-card">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Try asking</div>
            <div className="mt-3 space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-background"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-card">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span className="font-medium">Educational only</span>
            </div>
            PalTrade AI teaches concepts and frameworks. It does not provide financial advice or price predictions. Trading forex involves substantial risk.
          </div>
        </aside>
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  desc,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="max-w-2xl">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
        {Icon && <Icon className="h-4 w-4" />}
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-3 text-muted-foreground">{desc}</p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 bg-card/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded bg-gold text-[10px] font-bold text-primary-foreground">P</span>
          <span>© {new Date().getFullYear()} PalTrade — Educational content, not financial advice.</span>
        </div>
        <div className="flex gap-5">
          <a href="#classes" className="hover:text-foreground">Classes</a>
          <a href="#markets" className="hover:text-foreground">Markets</a>
          <a href="#mentor" className="hover:text-foreground">AI Mentor</a>
        </div>
      </div>
    </footer>
  );
}
