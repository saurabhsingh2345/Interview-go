"use client";

export type AvatarState = "idle" | "speaking" | "listening" | "thinking";

const COPY: Record<AvatarState, string> = {
  idle: "Ready",
  speaking: "Speaking",
  listening: "Listening",
  thinking: "Thinking",
};

export function InterviewerAvatar({
  state = "idle",
  name = "Enfeca",
  role = "AI Interviewer",
  size = 320,
}: {
  state?: AvatarState;
  name?: string;
  role?: string;
  size?: number;
}) {
  const showWave = state === "speaking" || state === "listening";
  const waveVariant = state === "listening" ? "teal" : "amber";

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="avatar-stage" data-state={state} style={{ maxWidth: size }}>
        <span className="avatar-ring r3" />
        <span className="avatar-ring r2" />
        <span className="avatar-ring r1" />
        <div className="avatar-orb" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <div className="brand-wordmark text-xl" style={{ color: "var(--foreground)" }}>
          {name}
        </div>
        <div className="eyebrow">{role}</div>

        <div className="mt-1 flex items-center gap-3">
          {showWave ? (
            <span className="waveform" data-variant={waveVariant}>
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} />
              ))}
            </span>
          ) : null}
          <span
            className="pill"
            data-tone={state}
            style={{
              background:
                state === "listening"
                  ? "var(--accent-teal-soft)"
                  : state === "idle"
                    ? "color-mix(in srgb, var(--foreground) 8%, transparent)"
                    : "var(--accent-amber-soft)",
              color:
                state === "listening"
                  ? "var(--accent-teal)"
                  : state === "idle"
                    ? "var(--foreground-muted)"
                    : "var(--accent-amber-strong)",
            }}
          >
            <span className="status-dot" />
            {COPY[state]}
          </span>
        </div>
      </div>
    </div>
  );
}

export default InterviewerAvatar;
