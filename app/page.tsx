"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { DAILY_LIMIT_MESSAGE } from "@/lib/errors";
import { useSpeechInput } from "@/lib/useSpeechInput";

// react-markdown passes an extra `node` (AST) prop to every renderer — drop it
// before spreading the rest onto a plain DOM element, or it leaks in as a
// literal `node="[object Object]"` attribute.
const markdownComponents: Components = {
  p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
  ul: ({ node, ...props }) => (
    <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-white" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a
      className="text-mbta-orange underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
};

const SLOW_RESPONSE_MS = 12_000;

const LINE_DOTS: { name: string; color: string }[] = [
  { name: "Red", color: "#DA291C" },
  { name: "Orange", color: "#ED8B00" },
  { name: "Blue", color: "#003DA5" },
  { name: "Green", color: "#00843D" },
  { name: "Silver", color: "#7C878E" },
];

export default function Home() {
  const { messages, status, error, sendMessage, clearError, regenerate } =
    useChat();
  const [input, setInput] = useState("");
  const [isSlow, setIsSlow] = useState(false);
  const speech = useSpeechInput(setInput);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!isLoading) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), SLOW_RESPONSE_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setInput(e.target.value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    clearError();
    speech.stop(); // don't let a still-listening mic keep appending to the next message
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* Header reads like a station sign, not an app header */}
      <header className="border-b border-white/10 px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-mbta-dim">
              Boston · Live
            </p>
            <h1 className="text-2xl font-bold tracking-tight">
              Transit Copilot
            </h1>
          </div>
          <div className="flex gap-1.5">
            {LINE_DOTS.map((l) => (
              <span
                key={l.name}
                className="line-dot"
                style={{ backgroundColor: l.color }}
                title={`${l.name} Line`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Conversation */}
      <section className="flex-1 max-w-2xl w-full mx-auto px-6 py-6 flex flex-col gap-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-mbta-dim text-sm leading-relaxed border border-white/10 rounded-lg p-4 bg-mbta-panel">
            Ask something like:
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li>&ldquo;Any delays on the Red Line right now?&rdquo;</li>
              <li>&ldquo;Next trains from Harvard toward Alewife&rdquo;</li>
              <li>&ldquo;Is the Orange Line running normally?&rdquo;</li>
            </ul>
          </div>
        )}

        {messages.map((m, idx) => {
          // The model can exhaust its tool-call budget without ever producing
          // text (finishReason "tool-calls" with no answer) — that ends the
          // stream cleanly, so no error fires and the bubble would otherwise
          // just be blank forever. Only call it "stuck" once generation for
          // this message has actually stopped, not while it's still in flight.
          const isLastMessage = idx === messages.length - 1;
          const hasText = m.parts.some((part) => part.type === "text");
          const isStuck = m.role === "assistant" && !hasText && !(isLastMessage && isLoading);

          return (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "self-end max-w-[85%] bg-mbta-panel border border-white/10 rounded-lg px-4 py-2.5"
                  : "self-start max-w-[85%] bg-transparent border-l-2 border-mbta-orange pl-4 py-1"
              }
            >
              <p className="text-xs uppercase tracking-wide text-mbta-dim mb-1">
                {m.role === "user" ? "You" : "Copilot"}
              </p>
              <div className="text-sm leading-relaxed">
                {isStuck ? (
                  <span className="text-mbta-dim italic">
                    Couldn&rsquo;t find a clear answer for that — try rephrasing,
                    or double-check the stop or line name.
                  </span>
                ) : (
                  m.parts.map((part, i) => {
                    if (part.type !== "text") return null;
                    return m.role === "user" ? (
                      <span key={i} className="whitespace-pre-wrap">
                        {part.text}
                      </span>
                    ) : (
                      <ReactMarkdown
                        key={i}
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {part.text}
                      </ReactMarkdown>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <p className="text-xs font-mono text-mbta-dim animate-pulse">
            {isSlow ? "still checking the T… this is taking longer than usual" : "checking the T…"}
          </p>
        )}

        {error && (
          <div className="text-sm border border-red-500/30 bg-red-500/10 text-red-200 rounded-lg p-4 flex items-center justify-between gap-4">
            <span>{error.message || "Something went wrong reaching the T."}</span>
            {error.message !== DAILY_LIMIT_MESSAGE && (
              <button
                type="button"
                onClick={() => regenerate()}
                className="shrink-0 text-xs font-semibold uppercase tracking-wide underline underline-offset-2"
              >
                Try again
              </button>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      {/* Input, styled like a countdown/entry row on a real board */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 px-6 py-4"
      >
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            className="flex-1 bg-mbta-panel border border-white/10 rounded-md px-4 py-2.5 text-sm outline-none placeholder:text-mbta-dim"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about a line, stop, or trip…"
          />
          {speech.isSupported && (
            <button
              type="button"
              onClick={() => speech.toggle(input)}
              aria-label={speech.isListening ? "Stop dictation" : "Start dictation"}
              title={speech.isListening ? "Stop dictation" : "Start dictation"}
              className={
                "shrink-0 rounded-md px-3 py-2.5 border " +
                (speech.isListening
                  ? "bg-mbta-orange border-mbta-orange text-black animate-pulse"
                  : "bg-mbta-panel border-white/10 text-mbta-dim")
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-mbta-orange text-black font-semibold text-sm rounded-md px-4 py-2.5 disabled:opacity-50"
          >
            Go
          </button>
        </div>
        {speech.error && (
          <p className="max-w-2xl mx-auto text-xs text-red-300 mt-2">
            {speech.error}
          </p>
        )}
        <p className="max-w-2xl mx-auto text-xs text-mbta-dim mt-2">
          Transit Copilot can make mistakes. For anything time-critical, double-check at{" "}
          <a
            href="https://www.mbta.com"
            target="_blank"
            rel="noreferrer"
            className="text-mbta-orange underline underline-offset-2"
          >
            mbta.com
          </a>
          .
        </p>
      </form>
    </main>
  );
}
