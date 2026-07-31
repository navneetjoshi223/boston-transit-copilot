# Transit Copilot — Boston

An AI agent for checking MBTA (the T) status and arrivals in plain language, backed by live data.

Example questions:
- "Any delays on the Red Line right now?"
- "Next trains from Harvard toward Alewife"
- "Is the Orange Line running normally?"

## Tech stack

- **Framework:** Next.js 14 (App Router), TypeScript, deployed on the Edge runtime
- **UI:** React 18, Tailwind CSS, `react-markdown` for rendering responses, browser Speech-to-Text (Web Speech API) for voice input
- **AI:** [Vercel AI SDK](https://ai-sdk.dev) (`streamText`, tool calling, streaming UI) + [Groq](https://groq.com) (`openai/gpt-oss-120b`) as the LLM provider
- **Data:** [MBTA V3 API](https://api-v3.mbta.com) (JSON:API) for live stops, predictions, and alerts — no separate transit SDK, just typed `fetch` wrappers
- **Validation:** Zod schemas for tool inputs
- **Moderation:** a pre-LLM profanity guard (`bad-words`) that short-circuits obviously abusive input before it ever reaches the model, so no tokens are spent on it

## Features

- Voice input — dictate a question via the mic button (Web Speech API)
- Markdown-rendered responses (lists, bold, links)
- Copy-to-clipboard on any response
- A persistent disclaimer that the assistant can be wrong and time-critical info should be checked at mbta.com
- A graceful "couldn't find a clear answer" fallback if the model exhausts its tool-call budget without producing text, instead of a blank reply
- Error messages that distinguish a transient rate limit (worth retrying) from a hard daily quota (retry button is hidden, since retrying won't help)

## Why I built this

Portfolio project to demonstrate agentic AI patterns - an LLM that decides when to call tools, wraps a real external API, and handles failure honestly instead of guessing. Not trying to compete with Google Maps or the MBTA app; the goal was a small project I fully understand end to end.

**In scope for v1:**
- Status and arrivals for a stop or line, by name
- The agent chains its own tool calls (find the stop → check alerts → check predictions) instead of a hardcoded pipeline
- Honest failure when MBTA's API is slow or down — retry once, then say so, don't guess
- Disambiguates ambiguous stop names (e.g. "Watertown" matches both Watertown Square and Watertown Yard) by asking which one instead of guessing
- Verifies a route actually heads toward the rider's stated destination before claiming it, instead of assuming any route serving the origin is the right one
- Checks real predictions at the origin stop before proposing a transfer plan, instead of reasoning from the model's own (unreliable) knowledge of the map
- Deliberately gives no stop-by-stop itinerary or travel-time estimate — MBTA's API doesn't expose either, and the model can't be trusted to estimate them, so it's instructed not to guess

**Not in v1** (see Production Considerations below):
- Multi-leg trip planning
- Caching
- Rate limiting
- Persisted conversation history

## Architecture

- `lib/mbta.ts` — plain functions hitting the real MBTA V3 API (stops, predictions, alerts, routes). No AI here.
- `lib/tools.ts` — wraps those functions as AI SDK tools with Zod schemas so the model can call them.
- `app/api/chat/route.ts` — the agent loop. `streamText` + tools + `stopWhen: stepCountIs(5)` lets the model chain `findStop` → `checkAlerts` → `checkPredictions` on its own.
- `app/page.tsx` — chat UI using `useChat` for streaming.

The MBTA layer has no dependency on the AI layer — it's just testable TypeScript that happens to be exposed to a model as tools.

## Setup

1. Install Node.js 18.17+: https://nodejs.org
2. `npm install`
3. Get keys:
   - Groq (free): https://console.groq.com/keys
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
