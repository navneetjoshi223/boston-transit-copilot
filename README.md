# Transit Copilot — Boston

An AI agent that answers real questions about getting around Boston on the T,
using live MBTA data instead of guessing.

Ask things like:
- "Any delays on the Red Line right now?"
- "Next trains from Harvard toward Alewife"
- "Is the Orange Line running normally?"

## What this project aspires to be

This is a portfolio piece, not a startup — the goal is a **small, fully
understood, working prototype** that demonstrates real agentic AI skills:
an LLM that decides when and how to call tools, wrapping a live external
API, with honest handling of what happens when that API doesn't cooperate.

Deliberately **in scope for v1**:
- Real-time status/arrivals for a stop or line a rider names
- An agent that chains tool calls itself (find the stop → check alerts →
  check predictions) rather than a hardcoded pipeline
- Graceful, honest failure when MBTA's API is slow or down

Deliberately **out of scope for v1** (see "Production Considerations"
below for why, and what each would take):
- Multi-leg trip planning (A → B with transfers)
- Caching (Redis/Upstash)
- Rate limiting / abuse protection
- Persisted conversation history

The point isn't that these don't matter — it's that a small, well-reasoned
v1 with a documented path forward is a stronger signal than a bigger one
built without fully understanding each piece.

## How it works (the interesting part)

This isn't a wrapper around a chatbot — it's an agent with tools:

1. **`lib/mbta.ts`** — plain functions that call the real MBTA V3 API
   (stops, predictions, alerts, routes). No AI involved here at all.
2. **`lib/tools.ts`** — wraps those functions as AI SDK `tool()`s with
   Zod schemas, so the model knows what each tool does and what
   arguments it takes.
3. **`app/api/chat/route.ts`** — the actual agent loop. `streamText` with
   `tools` + `maxSteps: 5` lets the model call `findStop`, then
   `checkAlerts`, then `checkPredictions` in sequence — deciding on
   its own which tools it needs, in what order — before writing a
   final answer.
4. **`app/page.tsx`** — the chat UI, using the AI SDK's `useChat` hook
   for streaming.

The MBTA API layer is intentionally decoupled from the AI layer. That's
worth keeping in your own projects: the tool functions are boring,
testable TypeScript that would work with no LLM at all. The agent just
decides when to call them.

## Setup (step by step — assumes you're new to Next.js)

**1. Install Node.js** (v18.17+) if you don't have it: https://nodejs.org

**2. Install dependencies**
```bash
npm install
```

**3. Get API keys**
- OpenAI key: https://platform.openai.com/api-keys (or swap `@ai-sdk/openai`
  for `@ai-sdk/anthropic` in `route.ts` if you'd rather use Claude — same
  pattern, different import)
- MBTA key (optional but recommended, free): https://api-v3.mbta.com/register

**4. Set environment variables**
```bash
cp .env.local.example .env.local
# then paste your keys into .env.local
```

**5. Run it**
```bash
npm run dev
```
Open http://localhost:3000

## Production considerations (deliberately not built — reasoning below)

If this had to survive real public traffic, here's what I'd add and why
I didn't build it into v1:

**Caching MBTA responses (Redis, not in-memory).** MBTA data is live, so
caching is about deduplicating bursts of requests for the same stop
(e.g. many people asking about Park Street within the same 15 seconds),
not about staleness tolerance. The important detail: an in-memory cache
(a plain JS object/Map) would silently do nothing in a serverless/edge
deployment, since each request can land on a different, memory-isolated
instance. It wouldn't error — it would just never hit, quietly. That's
the kind of bug that's invisible in dev and only shows up as "why is our
MBTA API usage the same as if we had no cache" in production. Upstash
Redis (REST-based, works from edge runtime) is the standard fix. TTL
would be short — 15-20s — matched to how fast real-time data actually
changes.

**Rate limiting.** Deferred deliberately, but with a clear first step in
mind: per-IP limiting via Upstash's `Ratelimit` package, which pairs
naturally with the Redis cache above (same infra, so adding one after
the other is cheap). Without this, the real risk isn't the site getting
slow — it's that anyone can trigger paid LLM calls freely, which is a
billing risk, not a performance one. This is the first thing I'd add
the moment this saw any real traffic.

**Graceful degradation, defined precisely.** The agent retries a failed
MBTA API call once (short timeout, a few seconds), and if it still
fails, tells the rider plainly that live data wasn't available rather
than guessing. Deliberately *not* falling back to scheduled (non-live)
times — silently swapping real-time data for a static schedule is worse
than admitting the gap, since the whole value of this tool is knowing
if the T is actually behaving normally right now.

**Other things I'd add before calling this "production"**: multi-leg
trip planning (would need a second data source, since MBTA's API
doesn't do this itself), persisted history, a map view, and a small eval
suite (~10 known Q&A pairs) to catch cases where the agent calls tools
in the wrong order or skips resolving a stop name before querying it.

## A note on API versions

The Vercel AI SDK moves fast. If `tool()`, `streamText`, or `useChat`
look slightly different from what's in this repo when you check the
docs, that's expected — follow the current docs at
https://ai-sdk.dev/docs for the exact current signatures, and adjust
`lib/tools.ts` / `route.ts` accordingly. The architecture (tools wrapping
plain functions, an agent loop, a streaming UI) will stay the same even
if some function names shift.
