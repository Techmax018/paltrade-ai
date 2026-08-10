/**
 * Redirects the browser to Deriv OAuth2 authorization endpoint.
 * Stores PKCE state/verifier in secure cookies so the callback can exchange
 * the authorization code server-side.
 */
import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";

const AUTHORIZE_ENDPOINT = "https://auth.deriv.com/oauth2/auth";
const DEFAULT_SCOPE = "trade";
const COOKIE_MAX_AGE = 10 * 60; // 10 minutes

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

function createCodeChallenge(verifier: string): string {
  const digest = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(digest);
}

function createCookie(name: string, value: string): string {
  const cookie = [`${name}=${encodeURIComponent(value)}`, `Path=/`, `Max-Age=${COOKIE_MAX_AGE}`, `SameSite=Lax`, `HttpOnly`];
  if (process.env.NODE_ENV === "production") cookie.push("Secure");
  return cookie.join("; ");
}

function getRedirectUri(request: Request): string {
  const configured = process.env.VITE_DERIV_REDIRECT_URI?.trim();
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/auth/deriv/callback`;
}

function getClientId(): string {
  const clientId = process.env.VITE_DERIV_APP_ID?.trim() || process.env.DERIV_APP_ID?.trim();
  if (!clientId) {
    throw new Error("DERIV app ID is not configured. Set VITE_DERIV_APP_ID or DERIV_APP_ID.");
  }
  return clientId;
}

export const Route = createFileRoute("/api/auth/deriv/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let clientId: string;
        try {
          clientId = getClientId();
        } catch (error) {
          return new Response(
            `Missing Deriv config: ${(error as Error).message}`,
            { status: 500, headers: { "Content-Type": "text/plain" } },
          );
        }

        const code_verifier = createCodeVerifier();
        const code_challenge = createCodeChallenge(code_verifier);
        const state = base64UrlEncode(crypto.randomBytes(16));
        const redirectUri = getRedirectUri(request);

        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: DEFAULT_SCOPE,
          state,
          code_challenge,
          code_challenge_method: "S256",
        });

        const url = new URL(request.url);
        if (url.searchParams.get("signup") === "1") {
          params.set("prompt", "registration");
        }

        const headers = new Headers({
          Location: `${AUTHORIZE_ENDPOINT}?${params.toString()}`,
          "Cache-Control": "no-store",
        });
        headers.append("Set-Cookie", createCookie("deriv_pkce_state", state));
        headers.append("Set-Cookie", createCookie("deriv_pkce_verifier", code_verifier));

        return new Response(null, { status: 302, headers });
      },
    },
  },
});
