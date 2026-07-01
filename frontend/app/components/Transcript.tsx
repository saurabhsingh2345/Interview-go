"use client";

import { useEffect, useRef } from "react";

export type TxRole = "ai" | "candidate";
export interface TxMessage {
  id: string | number;
  role: TxRole;
  text: string;
  meta?: string;
}

/** Splits the latest AI line into words that blur/fade in for a "streaming" feel. */
function StreamingText({ text }: { text: string }) {
  const words = text.split(/(\s+)/);
  return (
    <>
      {words.map((w, i) =>
        w.trim() === "" ? (
          w
        ) : (
          <span
            key={i}
            className="tx-word"
            style={{ animationDelay: `${Math.min(i * 28, 1400)}ms` }}
          >
            {w}
          </span>
        ),
      )}
    </>
  );
}

export function Transcript({
  messages,
  typing = null,
  partial = "",
  emptyHint = "The conversation will appear here, line by line.",
}: {
  messages: TxMessage[];
  typing?: TxRole | null;
  partial?: string;
  emptyHint?: string;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing, partial]);

  const hasContent = messages.length > 0 || typing || partial;

  return (
    <div className="transcript">
      {!hasContent ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "var(--accent-amber-soft)", color: "var(--accent-amber-strong)" }}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9A1.5 1.5 0 0 1 18.5 16H9l-4 3.5z" />
              <path d="M8 9h8M8 12h5" />
            </svg>
          </div>
          <p className="text-sm" style={{ color: "var(--foreground-subtle)" }}>
            {emptyHint}
          </p>
        </div>
      ) : null}

      {messages.map((m, i) => {
        const isLast = i === messages.length - 1;
        const ai = m.role === "ai";
        return (
          <div key={m.id} className={`tx-row ${ai ? "ai" : "candidate"}`}>
            <div className={`tx-avatar ${ai ? "ai" : "me"}`}>{ai ? "AI" : "You"}</div>
            <div>
              <div className="tx-bubble">
                {ai && isLast ? <StreamingText text={m.text} /> : m.text}
              </div>
              {m.meta ? <div className="tx-meta" style={{ textAlign: ai ? "left" : "right" }}>{m.meta}</div> : null}
            </div>
          </div>
        );
      })}

      {partial ? (
        <div className="tx-row candidate">
          <div className="tx-avatar me">You</div>
          <div>
            <div className="tx-bubble" style={{ opacity: 0.72 }}>
              {partial}
              <span style={{ color: "var(--accent-teal)" }}> ▍</span>
            </div>
            <div className="tx-meta" style={{ textAlign: "right" }}>transcribing…</div>
          </div>
        </div>
      ) : null}

      {typing ? (
        <div className={`tx-row ${typing === "ai" ? "ai" : "candidate"}`}>
          <div className={`tx-avatar ${typing === "ai" ? "ai" : "me"}`}>{typing === "ai" ? "AI" : "You"}</div>
          <div className="tx-bubble">
            <span className="typing">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}

export default Transcript;
