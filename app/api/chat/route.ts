import { google } from "@ai-sdk/google";
import {
  APICallError,
  convertToModelMessages,
  RetryError,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { DAILY_LIMIT_MESSAGE } from "@/lib/errors";
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
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google("gemini-flash-latest"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: transitTools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.error("chat stream error:", error);

      const cause = RetryError.isInstance(error) ? error.lastError : error;
      if (APICallError.isInstance(cause) && cause.statusCode === 429) {
        return DAILY_LIMIT_MESSAGE;
      }
      return "Something went wrong checking the T. Please try again.";
    },
  });
}
