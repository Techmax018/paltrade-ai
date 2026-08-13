/**
 * POST /api/v1/ai-trade/execute
 *
 * Receives { candles, symbol, linkedBrokerId, userBalance }
 * Calls an open-source model endpoint (configurable via env) to analyze
 * and returns a decision object. If decision meets risk rules, attempts
 * to execute via the linked broker (stubbed / extensible).
 */
import { Router, Request, Response } from "express";
import { query, queryOne } from "../db/client";
import { requireAuth } from "../middleware/requireAuth";
import { decrypt } from "../lib/auth";
import crypto from "crypto";

const router = Router();
router.use(requireAuth);

type Decision = { signal: "BUY" | "SELL" | "WAIT"; confidence: number; sl: number; tp: number };

async function analyzeWithOpenModel(candles: unknown): Promise<Decision> {
  const prompt = `You are an automated quant trader. Analyze these candles and return JSON strictly in this format: {"signal": "BUY"|"SELL"|"WAIT", "confidence": 0-100, "sl": number, "tp": number}. Only output the JSON object. Candles: ${JSON.stringify(candles)}`;

  // Prefer Hugging Face Inference API when HF_API_KEY is present
  // Prefer Google Generative API when GOOGLE_API_KEY is present
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_MODEL) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Prefer OAuth bearer token if provided (safer for production); otherwise use API key header
    if (process.env.GOOGLE_OAUTH_TOKEN) headers.Authorization = `Bearer ${process.env.GOOGLE_OAUTH_TOKEN}`;
    else if (process.env.GOOGLE_API_KEY) headers["X-goog-api-key"] = process.env.GOOGLE_API_KEY;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GOOGLE_MODEL}:generateContent`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const body = await res.json();
    const candidates = body.candidates ?? body.output?.candidates ?? [];
    let text = "";
    if (Array.isArray(candidates) && candidates.length) {
      const c = candidates[0];
      if (Array.isArray(c.content)) text = c.content.map((p: any) => p.text || "").join("");
      else if (Array.isArray(c.output)) text = c.output.map((o: any) => (Array.isArray(o.content) ? o.content.map((p: any) => p.text || "").join("") : "")).join("");
      else text = JSON.stringify(c);
    } else {
      text = JSON.stringify(body);
    }
    const match = text.match(/\{[^]*\}/);
    if (!match) throw new Error("Google model did not return JSON in expected format");
    return JSON.parse(match[0]) as Decision;
  }

  if (process.env.HF_API_KEY && process.env.HF_MODEL) {
    const res = await fetch(`https://api-inference.huggingface.co/models/${process.env.HF_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: prompt }),
    });
    const data = await res.json();
    // HF may return generated_text or an array — try to extract JSON substring
    const text = Array.isArray(data) ? (data[0]?.generated_text ?? JSON.stringify(data)) : (data.generated_text ?? JSON.stringify(data));
    const match = text.match(/\{[^]*\}/);
    if (!match) throw new Error("Model did not return JSON in expected format");
    return JSON.parse(match[0]) as Decision;
  }

  // Fallback to a generic model URL (user-provided) that returns JSON body
  if (process.env.MODEL_URL) {
    const res = await fetch(process.env.MODEL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const body = await res.json();
    if (body && typeof body === "object" && body.signal) return body as Decision;
    throw new Error("Model endpoint returned unexpected payload");
  }

  throw new Error("No model configured. Set HF_API_KEY+HF_MODEL or MODEL_URL in env.");
}

async function executeBrokerOrder(params: {
  userId: string;
  linkedBrokerId: string;
  symbol: string;
  action: "BUY" | "SELL";
  stopLoss: number;
  takeProfit: number;
  stake: number;
}) {
  // Minimal, safe stub: look up broker and return a structured placeholder result.
  const { userId, linkedBrokerId } = params;
  const broker = await queryOne<{ id: string; broker_type: string; oauth_access_token: string | null; bridge_reference_id: string | null }>(
    `SELECT id, broker_type, oauth_access_token, bridge_reference_id FROM linked_brokers WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
    [linkedBrokerId, userId],
  );
  if (!broker) throw new Error("Linked broker not found or not active");

  if (broker.broker_type === "DERIV") {
    // decrypt token if present — this is required for real Deriv API calls
    const token = broker.oauth_access_token ? decrypt(broker.oauth_access_token) : null;
    // TODO: implement real Deriv order placement (WebSocket/client) using `token`
    return { placed: true, provider: "DERIV", orderId: `stub-deriv-${Date.now()}` };
  }

  if (broker.broker_type === "VANTAGE_MT5") {
    // For MetaApi (VANTAGE_MT5) we would call MetaApi / AgiliumTrade endpoints using bridge_reference_id
    const metaRef = broker.bridge_reference_id;
    // TODO: implement MetaApi order placement using `metaRef`
    return { placed: true, provider: "VANTAGE_MT5", orderId: `stub-mt5-${Date.now()}` };
  }

  if (broker.broker_type === "GEMINI") {
    // Expect oauth_access_token to contain encrypted JSON: { apiKey, apiSecret }
    if (!broker.oauth_access_token) throw new Error("No API credentials stored for Gemini");
    const decrypted = decrypt(broker.oauth_access_token);
    let creds: { apiKey: string; apiSecret: string };
    try {
      creds = JSON.parse(decrypted);
    } catch {
      throw new Error("Invalid Gemini credentials format");
    }

    // Fetch current ticker to compute amount from stake (stake is in quote currency)
    const pubTickerRes = await fetch(`https://api.gemini.com/v1/pubticker/${params.symbol}`);
    if (!pubTickerRes.ok) {
      const text = await pubTickerRes.text();
      throw new Error(`Failed to fetch Gemini ticker: ${text}`);
    }
    const ticker = await pubTickerRes.json() as { last: string };
    const lastPrice = Number(ticker.last);
    if (!lastPrice || Number.isNaN(lastPrice)) throw new Error("Invalid ticker price from Gemini");

    const amount = String((params.stake / lastPrice).toFixed(8));

    const orderPayload = {
      request: "/v1/order/new",
      nonce: Date.now().toString(),
      symbol: params.symbol,
      amount,
      side: params.action === "BUY" ? "buy" : "sell",
      type: "exchange market",
    } as Record<string, unknown>;

    const payloadB64 = Buffer.from(JSON.stringify(orderPayload)).toString("base64");
    const signature = crypto.createHmac("sha384", creds.apiSecret).update(payloadB64).digest("hex");

    const orderRes = await fetch("https://api.gemini.com/v1/order/new", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-GEMINI-APIKEY": creds.apiKey,
        "X-GEMINI-PAYLOAD": payloadB64,
        "X-GEMINI-SIGNATURE": signature,
      },
      body: JSON.stringify({}),
    });

    const orderBody = await orderRes.text();
    if (!orderRes.ok) {
      throw new Error(`Gemini order failed: ${orderBody}`);
    }
    // Return parsed response when possible
    try {
      return { placed: true, provider: "GEMINI", raw: JSON.parse(orderBody) };
    } catch {
      return { placed: true, provider: "GEMINI", raw: orderBody };
    }
  }

  throw new Error("Unsupported broker type");
}

router.post("/execute", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.user.sub as string;
    const { candles, symbol, linkedBrokerId, userBalance } = req.body as {
      candles: unknown;
      symbol?: string;
      linkedBrokerId?: string;
      userBalance?: number;
    };

    if (!candles || !symbol || !linkedBrokerId || typeof userBalance !== "number") {
      res.status(422).json({ ok: false, error: "candles, symbol, linkedBrokerId and userBalance are required." });
      return;
    }

    const decision = await analyzeWithOpenModel(candles);
    const { signal, confidence, sl, tp } = decision;

    if (signal !== "WAIT" && confidence >= 80) {
      const stake = Math.max(1, Math.floor(userBalance * 0.01));
      const tradeResult = await executeBrokerOrder({ userId, linkedBrokerId, symbol, action: signal as "BUY" | "SELL", stopLoss: sl, takeProfit: tp, stake });
      return res.json({ ok: true, signal, confidence, tradeResult });
    }

    return res.json({ ok: false, reason: "Signal confidence below 80% threshold or WAIT", signal, confidence });
  } catch (err) {
    console.error("[ai-trade] error:", err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
