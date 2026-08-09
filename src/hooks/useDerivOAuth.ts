/**
 * useDerivOAuth.ts
 *
 * Handles the full Deriv OAuth 2.0 redirect flow.
 *
 * Flow:
 *  1. User clicks "Login with Deriv" → redirected to Deriv OAuth consent page
 *  2. After approval, Deriv redirects back to our app with URL params:
 *       ?acct1=CR123456&token1=a1-xxx&cur1=USD
 *       &acct2=VRTC999&token2=a1-yyy&cur2=USD   (virtual account if exists)
 *  3. This hook reads those params, picks the best account (real > virtual),
 *     persists the session to localStorage, and cleans the URL.
 *
 * Security:
 *  - Tokens are stored in localStorage under STORAGE_KEY.
 *  - They are short-lived Deriv read+trade tokens — not passwords.
 *  - The hook never logs token values to the console.
 *  - Call `logout()` to wipe all stored session data.
 *
 * Usage:
 *   const { session, accounts, activeAccount, setActiveAccount, logout } = useDerivOAuth();
 */

import { useEffect, useState } from "react";

/* ── Constants ──────────────────────────────────────────────────────────── */
const STORAGE_KEY = "paltrade.deriv.session.v1";
const CONNECTIONS_KEY = "paltrade.connections.v1";

function env(key: string): string | undefined {
  const e = (import.meta as unknown as { env?: Record<string, string> }).env;
  const v = e?.[key];
  return v && v.trim() ? v.trim() : undefined;
}

/** Deriv app id configured for this deployment (no silent 1089 fallback). */
export function getDerivAppId(): string | undefined {
  return env("VITE_DERIV_APP_ID");
}

/**
 * True when a usable Deriv app id is configured.
 * App id 1089 is Deriv's own demo app: its registered redirect URL points back
 * to Deriv, which is exactly the "bounces to Deriv and back to Deriv" loop.
 */
export function isDerivOAuthConfigured(): boolean {
  const id = getDerivAppId();
  return !!id && id !== "1089";
}

/**
 * Build the Deriv OAuth URL.
 *
 * Deriv sends the user back to the **redirect URL registered on the app**
 * (api.deriv.com → Manage applications). A `redirect_uri` query param is only
 * honoured when it is on that same registered domain, so we only append it
 * when VITE_DERIV_REDIRECT_URI is explicitly set.
 */
export function buildDerivOAuthUrl(): string {
  const appId = getDerivAppId() ?? "1089";
  const params = new URLSearchParams({ app_id: appId, l: "EN", brand: "deriv" });
  const configuredRedirect = env("VITE_DERIV_REDIRECT_URI");
  if (configuredRedirect) params.set("redirect_uri", configuredRedirect);
  return `https://oauth.deriv.com/oauth2/authorize?${params.toString()}`;
}


/* ── Types ──────────────────────────────────────────────────────────────── */
export interface DerivOAuthAccount {
  loginid: string;
  token: string;
  currency: string;
  /** "real" | "virtual" derived from loginid prefix */
  type: "real" | "virtual";
}

export interface DerivOAuthSession {
  accounts: DerivOAuthAccount[];
  /** loginid of the currently active account */
  activeLoginId: string;
  savedAt: number;
}

export interface UseDerivOAuthResult {
  /** All accounts returned by the OAuth redirect */
  accounts: DerivOAuthAccount[];
  /** The currently selected account (the one used for WebSocket auth) */
  activeAccount: DerivOAuthAccount | null;
  /** Switch the active account (e.g. real ↔ virtual) */
  setActiveAccount: (loginid: string) => void;
  /** True if a valid session exists in localStorage */
  isAuthenticated: boolean;
  /** True while the hook is parsing the URL / reading storage on first render */
  loading: boolean;
  /** Wipe the session and connections from localStorage */
  logout: () => void;
}

/* ── localStorage helpers ────────────────────────────────────────────────── */
function loadSession(): DerivOAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DerivOAuthSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: DerivOAuthSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(CONNECTIONS_KEY);
}

/* ── URL param parser ───────────────────────────────────────────────────── */
/**
 * Deriv appends up to N account pairs to the redirect URL:
 *   acct1, token1, cur1, acct2, token2, cur2, …
 * Returns them as an array of DerivOAuthAccount, sorted real-first.
 */
function parseDerivRedirectParams(search: string): DerivOAuthAccount[] {
  const params = new URLSearchParams(search);
  const accounts: DerivOAuthAccount[] = [];

  let i = 1;
  while (params.has(`acct${i}`)) {
    const loginid = params.get(`acct${i}`) ?? "";
    const token = params.get(`token${i}`) ?? "";
    const currency = params.get(`cur${i}`) ?? "USD";

    if (loginid && token) {
      // Deriv virtual accounts start with "VR" prefix
      const type: "real" | "virtual" = /^VR/i.test(loginid) ? "virtual" : "real";
      accounts.push({ loginid, token, currency, type });
    }
    i++;
  }

  // Sort: real accounts first, then virtual
  return accounts.sort((a, b) => {
    if (a.type === b.type) return 0;
    return a.type === "real" ? -1 : 1;
  });
}

/* ── Global redirect capture ────────────────────────────────────────────── */
/**
 * Captures a Deriv OAuth redirect on ANY route (Deriv always returns to the
 * URL registered on the app, which may not be /login). Persists the session,
 * strips the token params from the address bar and returns the session.
 * Safe to call repeatedly — it no-ops when there is nothing to capture.
 */
export function captureDerivRedirect(): DerivOAuthSession | null {
  if (typeof window === "undefined") return null;
  const search = window.location.search;
  const params = new URLSearchParams(search);
  if (!params.has("acct1") || !params.has("token1")) return null;

  const accounts = parseDerivRedirectParams(search);
  if (accounts.length === 0) return null;

  const preferred = accounts.find((a) => a.type === "real") ?? accounts[0];
  const newSession: DerivOAuthSession = {
    accounts,
    activeLoginId: preferred.loginid,
    savedAt: Date.now(),
  };
  saveSession(newSession);

  localStorage.setItem(
    CONNECTIONS_KEY,
    JSON.stringify(
      accounts.map((a) => ({
        broker: "deriv",
        account: a.loginid,
        currency: a.currency,
        connectedAt: Date.now(),
      })),
    ),
  );

  // Strip every acctN/tokenN/curN pair (Deriv can return many) + state.
  const clean = new URL(window.location.href);
  [...clean.searchParams.keys()]
    .filter((k) => /^(acct|token|cur)\d+$/i.test(k) || k === "state")
    .forEach((k) => clean.searchParams.delete(k));
  window.history.replaceState({}, "", clean.toString());

  window.dispatchEvent(new CustomEvent("deriv-oauth-connected", { detail: newSession }));
  return newSession;
}

/* ── Main hook ──────────────────────────────────────────────────────────── */
export function useDerivOAuth(): UseDerivOAuthResult {
  const [session, setSession] = useState<DerivOAuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const captured = captureDerivRedirect();
    setSession(captured ?? loadSession());
    setLoading(false);

    const onConnected = (e: Event) => {
      const detail = (e as CustomEvent<DerivOAuthSession>).detail;
      if (detail) setSession(detail);
    };
    window.addEventListener("deriv-oauth-connected", onConnected);
    return () => window.removeEventListener("deriv-oauth-connected", onConnected);
  }, []);


  function setActiveAccount(loginid: string) {
    if (!session) return;
    const updated: DerivOAuthSession = { ...session, activeLoginId: loginid };
    saveSession(updated);
    setSession(updated);
  }

  function logout() {
    clearSession();
    setSession(null);
  }

  const accounts = session?.accounts ?? [];
  const activeAccount =
    accounts.find((a) => a.loginid === session?.activeLoginId) ?? accounts[0] ?? null;

  return {
    accounts,
    activeAccount,
    setActiveAccount,
    isAuthenticated: !!activeAccount,
    loading,
    logout,
  };
}
