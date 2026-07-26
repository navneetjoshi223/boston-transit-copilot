import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { transitTools } from "@/lib/tools";

export const runtime = "edge";

const SYSTEM_PROMPT = `You are Transit Copilot, a Boston-area commute assistant.
You have live tools for the MBTA (the T): findStop, checkPredictions, checkAlerts, listRoutes.

Rules:
- Always resolve a place name to a stop ID with findStop before calling checkPredictions.
- If a rider asks about a route, line, or possible delay, call checkAlerts before answering —
  never assume service is normal.
- Be concrete: give actual times, line names, and next steps ("take the 71 bus instead").
- If MBTA data doesn't cover something (e.g. rideshare pricing), say so plainly instead of guessing.
- Keep answers short. Riders are checking this on their phone, often in a hurry.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: SYSTEM_PROMPT,
    messages,
    tools: transitTools,
    maxSteps: 5, // allows the model to chain tool calls, e.g. findStop -> checkAlerts -> checkPredictions
  });

  return result.toDataStreamResponse();
}
