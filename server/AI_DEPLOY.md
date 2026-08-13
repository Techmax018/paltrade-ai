AI model & deployment env — Vercel
=================================

Required env vars (minimum to run `aiTrade`):
- `GOOGLE_API_KEY` — Google Generative API key (or leave empty to use other providers).
- `GOOGLE_MODEL` — e.g. `gemini-flash-latest`.
- `HF_API_KEY` and `HF_MODEL` — optional Hugging Face inference config.
- `MODEL_URL` — optional fallback model endpoint (POST { prompt }).
- `ENCRYPTION_KEY` — 64 hex chars (32 bytes) used by `encrypt`/`decrypt`.
- `JWT_SECRET` — JSON Web Token secret for auth.
- `DATABASE_URL` — Postgres connection string used by the server.

Quick Vercel setup
1. Open your project in Vercel → Settings → Environment Variables.
2. Add variables above (name → value). Set the environment scope (Preview/Production).
3. Redeploy the project after adding secrets.

Security notes
- Never commit keys to git. Use Vercel environment variables or a secrets manager.
- If a key is leaked, revoke/regenerate it immediately (Google Cloud Console for `GOOGLE_API_KEY`).

How backend uses them
- `server/src/routes/aiTrade.ts` prefers providers in this order when envs set:
  1. `GOOGLE_API_KEY` + `GOOGLE_MODEL`
  2. `HF_API_KEY` + `HF_MODEL`
  3. `MODEL_URL`
- Gemini exchange credentials are stored per-user encrypted in `linked_brokers.oauth_access_token`. Use `POST /api/v1/connect/gemini` to store them.

Example curl to call AI trade endpoint (replace host and JWT):
```bash
curl -X POST https://<your-backend>/api/v1/ai-trade/execute \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"candles": [...], "symbol":"BTCUSD", "linkedBrokerId":"<id>", "userBalance":1000}'
```

Deployment tips
- The server expects Node 18+ (global `fetch`). For Vercel serverless functions use Node 18 runtime.
- For long-running sockets (broker streams) prefer a VPS or Render service rather than serverless.

If you want, I can also add a small `env.example` or CI docs next.
