import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant" | "system"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: { messages?: Msg[] };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];

        const system: Msg = {
          role: "system",
          content:
            "You are PalTrade AI, a forex trading mentor for beginners and intermediates. " +
            "Explain concepts (pips, lots, leverage, risk management, technical & fundamental analysis) clearly. " +
            "When asked to analyze a pair, describe general approach and current typical market drivers — " +
            "NEVER give guaranteed price predictions or financial advice. Always emphasize risk management " +
            "(1-2% risk per trade, stop losses). Keep answers concise, use bullet points, and be encouraging.",
        };

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [system, ...messages],
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(text || "AI request failed", { status: res.status });
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const reply = data.choices?.[0]?.message?.content ?? "";
        return Response.json({ reply });
      },
    },
  },
});
