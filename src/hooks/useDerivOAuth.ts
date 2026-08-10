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

/* ── OAuth 2.0 (Authorization Code + PKCE) ──────────────────────────────── */
const AUTHORIZE_ENDPOINT = "https://auth.deriv.com/oauth2/auth";
const PKCE_VERIFIER_KEY = "paltrade.deriv.pkce.verifier";
const PKCE_STATE_KEY = "paltrade.deriv.pkce.state";
const PKCE_REDIRECT_KEY = "paltrade.deriv.pkce.redirect";

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createPkce() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const code_verifier = base64UrlEncode(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code_verifier),
  );
  return {
    code_verifier,
    code_challenge: base64UrlEncode(digest),
    code_challenge_method: "S256" as const,
  };
}

/** The callback URL registered with Deriv for this deployment. */
export function getDerivRedirectUri(): string {
  const configured = env("VITE_DERIV_REDIRECT_URI");
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/deriv/callback`;
}

/**
 * Build the Deriv authorization URL (OAuth2 Authorization Code + PKCE) and
 * persist the verifier/state in sessionStorage for the callback to verify.
 */
export async function buildDerivAuthorizeUrl(opts?: {
  signup?: boolean;
  scope?: "trade" | "admin";
}): Promise<string> {
  const clientId = getDerivAppId();
  if (!clientId) throw new Error("VITE_DERIV_APP_ID is not configured.");

  const { code_verifier, code_challenge, code_challenge_method } = await createPkce();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const redirectUri = getDerivRedirectUri();

  sessionStorage.setItem(PKCE_VERIFIER_KEY, code_verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);
  sessionStorage.setItem(PKCE_REDIRECT_KEY, redirectUri);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: opts?.scope ?? "trade",
    state,
    code_challenge,
    code_challenge_method,
  });
  if (opts?.signup) params.set("prompt", "registration");

  const affiliate = env("VITE_DERIV_AFFILIATE_TOKEN");
  if (affiliate) {
    params.set("utm_medium", "affiliate");
    params.set("utm_source", affiliate);
  }
  const sidc = env("VITE_DERIV_SIDC");
  if (sidc) params.set("sidc", sidc);

  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/** Kick off the Deriv login (or signup) redirect. */
export async function startDerivLogin(opts?: { signup?: boolean }): Promise<void> {
  const url = await buildDerivAuthorizeUrl(opts);
  window.location.href = url;
}

/**
 * Handle the `?code=&state=` callback: verifies state, exchanges the code for
 * an access token through our backend, and persists the session.
 */
export async function completeDerivOAuth(search: string): Promise<DerivOAuthSession> {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error) {
    throw new Error(params.get("error_description") || error);
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code) throw new Error("Missing authorization code in callback URL.");

  const storedState = sessionStorage.getItem(PKCE_STATE_KEY);
  if (!storedState || storedState !== state) {
    throw new Error("State mismatch — possible CSRF. Please start the login again.");
  }
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — please start the login again.");

  const redirectUri = sessionStorage.getItem(PKCE_REDIRECT_KEY) || getDerivRedirectUri();

  const res = await fetch("/api/deriv/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: getDerivAppId(),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);

  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Token exchange failed.");
  }

  const session: DerivOAuthSession = {
    accounts: [],
    activeLoginId: "",
    savedAt: Date.now(),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  saveSession(session);
  localStorage.setItem(
    CONNECTIONS_KEY,
    JSON.stringify([{ broker: "deriv", account: "OAuth", currency: "USD", connectedAt: Date.now() }]),
  );
  window.dispatchEvent(new CustomEvent("deriv-oauth-connected", { detail: session }));
  return session;
}

/**
 * Legacy helper kept for callers that still render a plain link.
 * Prefer `startDerivLogin()` — PKCE requires async work before redirecting.
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
  /** OAuth2 access token (Authorization Code + PKCE flow) */
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
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
