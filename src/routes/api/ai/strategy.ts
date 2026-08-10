import { createFileRoute } from "@tanstack/react-router";

/**
 * Lovable AI strategy advisor.
 * Takes a live market snapshot from the terminal and returns a structured
 * recommendation: which strategy fits right now, and WHEN to take the trade.
 */

interface SnapshotBody {
  symbol?: string;
  timeframe?: string;
  price?: number;
  analysis?: Record<string, unknown>;
  recentCandles?: { o: number; h: number; l: number; c: number }[];
  balance?: number;
  clientTimeUtc?: string;
}

const SCHEMA = {
  name: "strategy_recommendation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "bestStrategy",
      "direction",
      "timing",
      "timingReason",
      "entryWindow",
      "sessionNote",
      "confidence",
      "checklist",
      "invalidation",
      "riskNote",
    ],
    properties: {
      bestStrategy: { type: "string" },
      direction: { type: "string", enum: ["BUY", "SELL", "STAND_ASIDE"] },
      timing: { type: "string", enum: ["TAKE_NOW", "WAIT_FOR_TRIGGER", "AVOID"] },
      timingReason: { type: "string" },
      entryWindow: { type: "string" },
      sessionNote: { type: "string" },
      confidence: { type: "integer" },
      checklist: { type: "array", items: { type: "string" } },
      invalidation: { type: "string" },
      riskNote: { type: "string" },
    },
  },
} as const;

export const Route = createFileRoute("/api/ai/strategy")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: SnapshotBody;
        try {
          body = (await request.json()) as SnapshotBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const nowUtc = new Date().toISOString();
        const snapshot = {
          symbol: body.symbol ?? "unknown",
          timeframe: body.timeframe ?? "M5",
          price: body.price ?? null,
          balance: body.balance ?? null,
          serverTimeUtc: nowUtc,
          clientTimeUtc: body.clientTimeUtc ?? nowUtc,
          analysis: body.analysis ?? {},
          recentCandles: (body.recentCandles ?? []).slice(-40),
        };

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            messages: [
              {
                role: "system",
                content:
                  "You are PalTrade AI, a disciplined forex & synthetic-index strategy analyst. " +
                  "You receive a live market snapshot (indicators, structure, FVGs, fib levels, recent candles) " +
                  "and must choose the single best-fitting strategy right now (e.g. trend continuation with EMA pullback, " +
                  "BOS + FVG retest, range fade at support/resistance, RSI divergence reversal, breakout retest) and judge TIMING: " +
                  "whether to take the trade now, wait for a specific trigger, or avoid. " +
                  "Consider the UTC time vs trading sessions (Sydney/Tokyo/London/New York, London-NY overlap) — synthetic indices trade 24/7. " +
                  "Be honest: if confluence is weak, say STAND_ASIDE / AVOID. Never promise profits. Keep every field short and concrete. " +
                  "confidence is 0-100. checklist has 3-5 short conditions to verify before entering.",
              },
              {
                role: "user",
                content:
                  "Market snapshot JSON:\n" +
                  JSON.stringify(snapshot) +
                  "\n\nReturn the best strategy and precise timing guidance.",
              },
            ],
            response_format: { type: "json_schema", json_schema: SCHEMA },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          if (res.status === 429)
            return new Response("Rate limit reached — try again shortly.", { status: 429 });
          if (res.status === 402)
            return new Response("AI credits exhausted — add credits to continue.", { status: 402 });
          return new Response(text || "AI request failed", { status: res.status });
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = data.choices?.[0]?.message?.content ?? "";
        try {
          return Response.json(JSON.parse(raw));
        } catch {
          return new Response("AI returned an unreadable response", { status: 502 });
        }
      },
    },
  },
});
