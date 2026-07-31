import { Filter } from "bad-words";
import type { UIMessage } from "ai";

// bad-words already matches on word boundaries internally, so it correctly
// skips real place names that contain a flagged word as a substring (e.g.
// "Middlesex", "Essex St") — verified directly against both.
const filter = new Filter();

export function containsVulgarLanguage(text: string): boolean {
  return filter.isProfane(text);
}

export function getLatestUserText(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMessage) return "";
  return lastUserMessage.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}
