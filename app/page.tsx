"use client";

import { useChat } from "ai/react";

const LINE_DOTS: { name: string; color: string }[] = [
  { name: "Red", color: "#DA291C" },
  { name: "Orange", color: "#ED8B00" },
  { name: "Blue", color: "#003DA5" },
  { name: "Green", color: "#00843D" },
  { name: "Silver", color: "#7C878E" },
];

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat();

  return (
    <main className="min-h-screen flex flex-col">
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

        {messages.map((m) => (
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
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {m.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <p className="text-xs font-mono text-mbta-dim animate-pulse">
            checking the T…
          </p>
        )}
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
          <button
            type="submit"
            disabled={isLoading}
            className="bg-mbta-orange text-black font-semibold text-sm rounded-md px-4 py-2.5 disabled:opacity-50"
          >
            Go
          </button>
        </div>
      </form>
    </main>
  );
}
