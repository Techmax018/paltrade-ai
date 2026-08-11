/**
 * Server-side Deriv OAuth2 callback at /api/auth/deriv/callback.
 * This route verifies the PKCE state, exchanges the code for tokens,
 * then writes the browser localStorage session via HTML+JS and redirects.
 */
import { createFileRoute } from "@tanstack/react-router";

const TOKEN_ENDPOINT = "https://auth.deriv.com/oauth2/token";

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const cookie of cookieHeader.split(";")) {
    const [name, ...rest] = cookie.trim().split("=");
    cookies[name] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

function buildHtmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getClientId(): string {
  return process.env.VITE_DERIV_APP_ID?.trim() || process.env.DERIV_APP_ID?.trim() || "";
}

function getClientSecret(): string | undefined {
  return process.env.DERIV_CLIENT_SECRET?.trim() || undefined;
}

function buildCookie(name: string, value: string, maxAge = 0): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=/`, `Max-Age=${maxAge}`, `SameSite=Lax`, `HttpOnly`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function getRedirectUri(request: Request): string {
  const configured = process.env.VITE_DERIV_REDIRECT_URI?.trim();
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/auth/deriv/callback`;
}

function buildSuccessHtml(data: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): string {
  const expiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;
  const session = {
    accounts: [],
    activeLoginId: "",
    savedAt: Date.now(),
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  } as const;
  const connections = [{ broker: "deriv", account: "OAuth", currency: "USD", connectedAt: Date.now() }];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Deriv sign-in complete</title>
  <meta http-equiv="refresh" content="1;url=/terminal" />
</head>
<body style="background:#020617;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="max-width:32rem;padding:1.5rem;border:1px solid rgba(148,163,184,0.18);border-radius:1rem;background:rgba(15,23,42,0.88);text-align:center;">
    <h1 style="margin:0 0 0.75rem;font-size:1.25rem;font-weight:700;">Deriv sign-in complete</h1>
    <p style="margin:0 0 1rem;color:rgba(148,163,184,0.9);">You are being redirected to PalTrade.</p>
    <script>
      try {
        localStorage.setItem("paltrade.deriv.session.v1", ${JSON.stringify(JSON.stringify(session))});
        localStorage.setItem("paltrade.connections.v1", ${JSON.stringify(JSON.stringify(connections))});
      } catch (e) {
        console.error("Unable to persist Deriv session", e);
      }
      window.location.href = "/terminal";
    </script>
    <noscript>
      <p style="color:#f87171;">JavaScript is required to complete sign-in. Please enable JavaScript and try again.</p>
      <a href="/terminal" style="color:#38bdf8;">Continue manually</a>
    </noscript>
  </div>
</body>
</html>`;
}

function buildErrorHtml(message: string): string {
  const escaped = escapeHtml(message);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Deriv sign-in failed</title>
</head>
<body style="background:#020617;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="max-width:32rem;padding:1.5rem;border:1px solid rgba(239,68,68,0.25);border-radius:1rem;background:rgba(239,68,68,0.08);text-align:center;">
    <h1 style="margin:0 0 0.75rem;font-size:1.25rem;font-weight:700;">Deriv sign-in failed</h1>
    <p style="margin:0 0 1rem;color:rgba(248,113,113,0.95);">${escaped}</p>
    <a href="/login" style="color:#38bdf8;text-decoration:none;font-weight:700;">Back to login</a>
  </div>
</body>
</html>`;
}

export const Route = createFileRoute("/api/auth/deriv/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = url.searchParams;
        const error = params.get("error");
        const error_description = params.get("error_description");
        if (error) {
          return buildHtmlResponse(buildErrorHtml(error_description || `OAuth error: ${error}`));
        }

        const code = params.get("code");
        const state = params.get("state");
        if (!code) {
          return buildHtmlResponse(buildErrorHtml("Missing authorization code in the callback URL."));
        }
        if (!state) {
          return buildHtmlResponse(buildErrorHtml("Missing state parameter in the callback URL."));
        }

        const cookies = parseCookies(request.headers.get("cookie"));
        const storedState = cookies["deriv_pkce_state"];
        const code_verifier = cookies["deriv_pkce_verifier"];
        if (!storedState || !code_verifier) {
          return buildHtmlResponse(buildErrorHtml("Missing PKCE cookies. Please start the Deriv login again."));
        }
        if (storedState !== state) {
          return buildHtmlResponse(buildErrorHtml("State mismatch — possible CSRF. Please try signing in again."));
        }

        const clientId = getClientId();
        if (!clientId) {
          return buildHtmlResponse(buildErrorHtml("Server configuration error: missing Deriv App ID."));
        }

        const redirect_uri = getRedirectUri(request);
        const form = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          redirect_uri,
          code_verifier,
        });
        const clientSecret = getClientSecret();
        if (clientSecret) {
          form.set("client_secret", clientSecret);
        }

        const tokenRes = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: form.toString(),
        });

        const payloadText = await tokenRes.text();
        let payload: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
        try {
          payload = JSON.parse(payloadText) as typeof payload;
        } catch {
          return buildHtmlResponse(buildErrorHtml("Invalid token response from Deriv."));
        }

        if (!tokenRes.ok || !payload.access_token) {
          const message = payload.error_description || payload.error || "Token exchange failed.";
          return buildHtmlResponse(buildErrorHtml(message));
        }

        const headers = new Headers({
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Location: "/terminal",
        });
        headers.append("Set-Cookie", buildCookie("deriv_pkce_state", "", 0));
        headers.append("Set-Cookie", buildCookie("deriv_pkce_verifier", "", 0));

        return new Response(
          buildSuccessHtml({ ...payload, access_token: payload.access_token }),
          { status: 200, headers },
        );
      },
    },
  },
});
