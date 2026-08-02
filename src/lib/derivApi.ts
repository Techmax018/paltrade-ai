/**
 * derivApi.ts — Deriv WebSocket API adapter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DROP-IN POINT FOR LIVE CREDENTIALS
 * Replace `DERIV_APP_ID` (or pass appId at connect time) and flip
 * `USE_MOCK` to false once you're ready to hit the live endpoint.
 * Live endpoint: wss://ws.derivws.com/websockets/v3?app_id=<APP_ID>
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const DERIV_WS_ENDPOINT = "wss://ws.derivws.com/websockets/v3";
export const DERIV_APP_ID = ""; // <-- insert your Deriv App ID here
export const USE_MOCK = true; // <-- set to false to use the real socket

export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "error";
export type AccountType = "demo" | "real";
export type Timeframe = "M1" | "M5" | "M15" | "H1";
export type Side = "BUY" | "SELL";

export interface DerivSymbol {
  code: string;
  label: string;
  kind: "forex" | "synthetic" | "metal";
  pipSize: number;
  pipValuePerLot: number; // USD per pip per 1.00 lot
  basePrice: number;
  volatility: number;
}

export const SYMBOLS: DerivSymbol[] = [
  { code: "frxXAUUSD", label: "Gold XAU/USD", kind: "metal", pipSize: 0.1, pipValuePerLot: 10, basePrice: 2338.4, volatility: 1.6 },
  { code: "frxEURUSD", label: "EUR/USD", kind: "forex", pipSize: 0.0001, pipValuePerLot: 10, basePrice: 1.0842, volatility: 0.9 },
  { code: "frxGBPUSD", label: "GBP/USD", kind: "forex", pipSize: 0.0001, pipValuePerLot: 10, basePrice: 1.2715, volatility: 1.1 },
  { code: "frxUSDJPY", label: "USD/JPY", kind: "forex", pipSize: 0.01, pipValuePerLot: 9.1, basePrice: 156.32, volatility: 1.0 },
  { code: "R_100", label: "Volatility 100 Index", kind: "synthetic", pipSize: 0.01, pipValuePerLot: 10, basePrice: 1420.55, volatility: 3.4 },
  { code: "R_75", label: "Volatility 75 Index", kind: "synthetic", pipSize: 0.01, pipValuePerLot: 10, basePrice: 98450.2, volatility: 2.8 },
  { code: "BOOM1000", label: "Boom 1000 Index", kind: "synthetic", pipSize: 0.01, pipValuePerLot: 10, basePrice: 9120.7, volatility: 2.2 },
];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = { M1: 60, M5: 300, M15: 900, H1: 3600 };

export interface Candle {
  time: number; // epoch seconds (candle open)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Tick {
  symbol: string;
  time: number;
  quote: number;
}

export interface AccountInfo {
  loginid: string;
  accountType: AccountType;
  currency: string;
  balance: number;
  equity: number;
  leverage: number;
}

export interface TradeRequest {
  symbol: string;
  side: Side;
  lots: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  label?: string;
}

export interface TradeResult {
  id: string;
  ok: boolean;
  message: string;
  request: TradeRequest;
  openedAt: number;
}

export interface ConnectOptions {
  appId: string;
  token: string;
  accountType: AccountType;
}

export interface DerivConnection {
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  onAccount(cb: (a: AccountInfo) => void): () => void;
  subscribeTicks(symbol: string, cb: (t: Tick) => void, startPrice?: number): () => void;
  getCandles(symbol: string, timeframe: Timeframe, count: number): Promise<Candle[]>;
  placeTrade(req: TradeRequest): Promise<TradeResult>;
  closeTrade(id: string): Promise<{ ok: boolean }>;
  disconnect(): void;
}

/* ── deterministic pseudo-random helpers (stable candle history) ───────────── */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCandles(symbol: string, timeframe: Timeframe, count: number): Candle[] {
  const meta = SYMBOLS.find((s) => s.code === symbol) ?? SYMBOLS[0];
  const step = TIMEFRAME_SECONDS[timeframe];
  const rand = mulberry(hashSeed(symbol + timeframe));
  const now = Math.floor(Date.now() / 1000);
  const start = now - (now % step) - step * (count - 1);
  const scale = meta.basePrice * 0.0006 * meta.volatility;
  let price = meta.basePrice;
  const out: Candle[] = [];
  let drift = 0;
  for (let i = 0; i < count; i++) {
    drift = drift * 0.94 + (rand() - 0.5) * scale * 0.9;
    const open = price;
    const close = open + drift + (rand() - 0.5) * scale;
    const high = Math.max(open, close) + rand() * scale * 0.8;
    const low = Math.min(open, close) - rand() * scale * 0.8;
    out.push({ time: start + i * step, open, high, low, close });
    price = close;
  }
  return out;
}

/* ── mock connection ───────────────────────────────────────────────────────── */
class MockDerivConnection implements DerivConnection {
  private statusCbs = new Set<(s: ConnectionStatus) => void>();
  private accountCbs = new Set<(a: AccountInfo) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private status: ConnectionStatus = "connecting";
  private account: AccountInfo;
  private prices = new Map<string, number>();

  constructor(opts: ConnectOptions) {
    this.account = {
      loginid: (opts.accountType === "demo" ? "VRTC" : "CR") + String(1000000 + (hashSeed(opts.token || "demo") % 899999)),
      accountType: opts.accountType,
      currency: "USD",
      balance: opts.accountType === "demo" ? 10000 : 2485.63,
      equity: opts.accountType === "demo" ? 10000 : 2485.63,
      leverage: opts.accountType === "demo" ? 500 : 200,
    };
    setTimeout(() => this.setStatus("connected"), 700);
    setTimeout(() => this.emitAccount(), 800);
    // periodic equity heartbeat
    this.timers.push(
      setInterval(() => {
        this.account = { ...this.account, equity: this.account.equity + (Math.random() - 0.48) * 2 };
        this.emitAccount();
      }, 4000),
    );
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s));
  }
  private emitAccount() {
    this.accountCbs.forEach((cb) => cb(this.account));
  }

  onStatus(cb: (s: ConnectionStatus) => void) {
    this.statusCbs.add(cb);
    cb(this.status);
    return () => this.statusCbs.delete(cb) as unknown as void;
  }
  onAccount(cb: (a: AccountInfo) => void) {
    this.accountCbs.add(cb);
    cb(this.account);
    return () => this.accountCbs.delete(cb) as unknown as void;
  }

  subscribeTicks(symbol: string, cb: (t: Tick) => void, startPrice?: number) {
    const meta = SYMBOLS.find((s) => s.code === symbol) ?? SYMBOLS[0];
    if (startPrice !== undefined) this.prices.set(symbol, startPrice);
    if (!this.prices.has(symbol)) {
      const hist = generateCandles(symbol, "M1", 120);
      this.prices.set(symbol, hist[hist.length - 1].close);
    }
    const id = setInterval(() => {
      const last = this.prices.get(symbol)!;
      const next = last + (Math.random() - 0.5) * meta.basePrice * 0.0004 * meta.volatility;
      this.prices.set(symbol, next);
      cb({ symbol, time: Math.floor(Date.now() / 1000), quote: next });
    }, 1000);
    this.timers.push(id);
    return () => clearInterval(id);
  }

  async getCandles(symbol: string, timeframe: Timeframe, count: number) {
    await new Promise((r) => setTimeout(r, 120));
    return generateCandles(symbol, timeframe, count);
  }

  async placeTrade(req: TradeRequest): Promise<TradeResult> {
    await new Promise((r) => setTimeout(r, 350));
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ok: true,
      message: `${req.side} ${req.lots.toFixed(2)} ${req.symbol} filled at ${req.entry}`,
      request: req,
      openedAt: Date.now(),
    };
  }

  async closeTrade() {
    await new Promise((r) => setTimeout(r, 200));
    return { ok: true };
  }

  disconnect() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.setStatus("disconnected");
  }
}

/**
 * connectWebSocket — returns a live-shaped connection object.
 * When USE_MOCK is false this is where you open the real socket:
 *   const ws = new WebSocket(`${DERIV_WS_ENDPOINT}?app_id=${appId}`)
 *   ws.send(JSON.stringify({ authorize: token }))
 *   ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }))
 *   ws.send(JSON.stringify({ buy: 1, price, parameters: {...} }))
 */
export function connectWebSocket(opts: ConnectOptions): DerivConnection {
  if (!USE_MOCK) {
    throw new Error("Live Deriv socket not wired yet — add your App ID in src/lib/derivApi.ts");
  }
  return new MockDerivConnection(opts);
}

/* ── indicators ────────────────────────────────────────────────────────────── */
export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < period - 1) {
      out.push(null);
      return;
    }
    if (prev === null) {
      const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  });
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const diff = values[i] - values[i - 1];
    const up = Math.max(diff, 0);
    const dn = Math.max(-diff, 0);
    if (i <= period) {
      gain += up;
      loss += dn;
      if (i < period) {
        out.push(null);
        continue;
      }
      gain /= period;
      loss /= period;
    } else {
      gain = (gain * (period - 1) + up) / period;
      loss = (loss * (period - 1) + dn) / period;
    }
    out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  }
  return out;
}

export const FIB_LEVELS = [0.382, 0.5, 0.618, 0.786] as const;

export function fibRetracement(candles: Candle[], lookback = 60) {
  const slice = candles.slice(-lookback);
  if (!slice.length) return null;
  const high = Math.max(...slice.map((c) => c.high));
  const low = Math.min(...slice.map((c) => c.low));
  const upTrend = slice[slice.length - 1].close >= (high + low) / 2;
  const levels = FIB_LEVELS.map((l) => ({
    level: l,
    price: upTrend ? high - (high - low) * l : low + (high - low) * l,
  }));
  return { high, low, upTrend, levels };
}
