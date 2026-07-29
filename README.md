# Transit Copilot — Boston

An AI agent for checking MBTA (the T) status and arrivals in plain language, backed by live data.

Example questions:
- "Any delays on the Red Line right now?"
- "Next trains from Harvard toward Alewife"
- "Is the Orange Line running normally?"

## Why I built this

Portfolio project to demonstrate agentic AI patterns — an LLM that decides when to call tools, wraps a real external API, and handles failure honestly instead of guessing. Not trying to compete with Google Maps or the MBTA app; the goal was a small project I fully understand end to end.

**In scope for v1:**
- Status and arrivals for a stop or line, by name
- The agent chains its own tool calls (find the stop → check alerts → check predictions) instead of a hardcoded pipeline
- Honest failure when MBTA's API is slow or down — retry once, then say so, don't guess

**Not in v1** (see Production Considerations below):
- Multi-leg trip planning
- Caching
- Rate limiting
- Persisted conversation history

## Architecture

- `lib/mbta.ts` — plain functions hitting the real MBTA V3 API (stops, predictions, alerts, routes). No AI here.
- `lib/tools.ts` — wraps those functions as AI SDK tools with Zod schemas so the model can call them.
- `app/api/chat/route.ts` — the agent loop. `streamText` + tools + `maxSteps: 5` lets the model chain `findStop` → `checkAlerts` → `checkPredictions` on its own.
- `app/page.tsx` — chat UI using `useChat` for streaming.

The MBTA layer has no dependency on the AI layer — it's just testable TypeScript that happens to be exposed to a model as tools.

## Setup

1. Install Node.js 18.17+: https://nodejs.org
2. `npm install`
3. Get keys:
   - Gemini (free, no card required): https://aistudio.google.com/apikey
   - MBTA (free, optional but recommended — raises your rate limit from 20/min to 1000/min): https://api-v3.mbta.com/register
4. `cp .env.local.example .env.local` and fill in your keys
5. `npm run dev`, then open http://localhost:3000

## Production considerations

Not built into v1, but here's what I'd add first and why.

**Caching (Redis, not in-memory).** MBTA data changes fast, so caching here is about deduplicating bursts of identical requests (e.g. 50 people checking Park Street in the same 10 seconds), not staleness. In-memory caching would be a mistake on serverless/edge — each request can hit a different instance, so a plain JS object never actually hits and you don't find out until you're wondering why your MBTA usage looks uncached. Upstash Redis (REST-based, works from edge) is the standard fix, short TTL (~15-20s).

**Rate limiting.** Skipped for now. Without it, the risk isn't the app getting slow — it's that anyone can trigger paid LLM calls for free, which is a billing risk. First thing I'd add if this got real traffic, using Upstash's `Ratelimit` package (same infra as the cache above).

**Failure handling.** Retry once on a failed MBTA call, short timeout. If it still fails, tell the user plainly rather than falling back to scheduled (non-live) times — a stale answer presented as current is worse than admitting the data's unavailable.

**Other things before I'd call this production-ready:** multi-leg trip planning (needs a second data source — MBTA doesn't do this itself), persisted history, a map view, and a small eval set (~10 known Q&A pairs) to catch cases where the agent skips resolving a stop name or calls tools out of order.

## Note on API versions

The AI SDK moves fast — if `tool()`, `streamText`, or `useChat` look different from this repo by the time you read it, check https://ai-sdk.dev/docs and adjust `lib/tools.ts` / `route.ts` accordingly. The overall shape (tools wrapping plain functions, an agent loop, a streaming UI) should hold even if specific APIs shift.
