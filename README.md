# NEXVORA Voice API

Express service that issues ten-minute LiveKit participant tokens and explicitly dispatches the configured LiveKit Agent.

## Local setup

```sh
npm install
cp .env.example .env
npm run dev
```

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env`. `ALLOWED_ORIGINS` is a comma-separated exact-origin allowlist; use the local website origin for development and the deployed site origins in production. Set `AGENT_NAME` to the same name configured for the agent. When deployed behind one trusted reverse proxy, restrict direct origin access and set `TRUST_PROXY=true` to rate-limit by the visitor IP.

`GET /health` returns a minimal health response. The frontend contract is `GET /token?lang=en|ar-eg&mode=text|voice`, returning `{ "url": "wss://...", "token": "..." }`. Invalid query values return HTTP 400. Tokens are limited to 30 requests per minute per IP. A dispatch/API failure returns HTTP 503 without exposing credentials; inspect the voice API runtime logs for the underlying exception.

For production, run `npm run build && npm start`, or build this directory as the Docker context and inject environment variables at runtime.
