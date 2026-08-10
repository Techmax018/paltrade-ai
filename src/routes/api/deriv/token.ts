/**
 * Backend token exchange for the Deriv OAuth2 Authorization Code + PKCE flow.
 * The browser never talks to https://auth.deriv.com/oauth2/token directly.
 */
import { createFileRoute } from "@tanstack/react-router";

const TOKEN_ENDPOINT = "https://auth.deriv.com/oauth2/token";

export const Route = createFileRoute("/api/deriv/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          code?: string;
          code_verifier?: string;
          redirect_uri?: string;
          client_id?: string;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }

        const clientId =
          body.client_id?.trim() ||
          process.env["DERIV_APP_ID"] ||
          process.env["VITE_DERIV_APP_ID"];

        if (!body.code || !body.code_verifier || !body.redirect_uri || !clientId) {
          return Response.json(
            { error: "invalid_request", error_description: "Missing OAuth parameters." },
            { status: 400 },
          );
        }

        const form = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: body.code,
          redirect_uri: body.redirect_uri,
          code_verifier: body.code_verifier,
        });

        const clientSecret = process.env["DERIV_CLIENT_SECRET"];
        if (clientSecret) form.set("client_secret", clientSecret);

        const res = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "Deriv-App-ID": clientId,
          },
          body: form.toString(),
        });

        const text = await res.text();
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: "invalid_response", error_description: text.slice(0, 300) };
        }

        return Response.json(data, { status: res.ok ? 200 : res.status });
      },
    },
  },
});
