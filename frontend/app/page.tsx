"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createInterview, Interview, listInterviews } from "./lib/api";
import { showToast } from "./components/Toast";
import { InterviewerAvatar } from "./components/InterviewerAvatar";
import { Layers, Activity, CheckCircle2, Sparkles, ArrowRight, ArrowUpRight } from "lucide-react";

const SUGGESTIONS = [
  "System design",
  "Go concurrency",
  "React architecture",
  "Data structures",
  "Behavioral / leadership",
];

const STAT_ICONS = [Layers, Activity, CheckCircle2, Sparkles];

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(true);

  useEffect(() => {
    listInterviews()
      .then((data) => setInterviews(Array.isArray(data) ? data : []))
      .catch((err: unknown) =>
        showToast(err instanceof Error ? err.message : "Failed to load interviews", "error"),
      )
      .finally(() => setLoadingInterviews(false));
  }, []);

  const stats = useMemo(() => {
    const completed = interviews.filter((i) => i.status === "completed");
    const inProgress = interviews.filter((i) => i.status === "in_progress");
    const avg = completed.length
      ? completed.reduce((s, i) => s + (i.score ?? 0), 0) / completed.length
      : 0;
    return [
      { label: "Total interviews", value: `${interviews.length}`, meta: "All sessions" },
      { label: "In progress", value: `${inProgress.length}`, meta: "Active now" },
      { label: "Completed", value: `${completed.length}`, meta: "Reviewed" },
      { label: "Average score", value: completed.length ? avg.toFixed(1) : "—", meta: "out of 10" },
    ];
  }, [interviews]);

  const recent = interviews.slice(0, 5);

  const handleStart = async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      showToast("Please enter an interview topic", "error");
      return;
    }
    setLoading(true);
    try {
      const data = await createInterview(trimmed);
      showToast("Interview created", "success");
      router.push(`/interview/${data.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create interview", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section-grid stagger">
      {/* hero */}
      <section className="surface surface-glow relative overflow-hidden p-7 sm:p-10">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }}
        />
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative">
            <span className="pill pill-primary"><Sparkles className="h-3.5 w-3.5" /> New session</span>
            <h1 className="display mt-5 text-4xl sm:text-5xl" style={{ color: "var(--foreground)" }}>
              Your interview,
              <br />
              <span style={{ color: "var(--accent-amber)" }}>conducted by Enfeca.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[0.97rem] leading-7" style={{ color: "var(--foreground-muted)" }}>
              Name a topic and Enfeca runs a structured, adaptive interview — asking, listening,
              following up, and scoring every answer in real time.
            </p>

            <div className="mt-7 max-w-xl">
              <label htmlFor="topic" className="label">Interview topic</label>
              <div className="input-shell">
                <Sparkles className="h-[18px] w-[18px]" style={{ color: "var(--accent-amber)" }} />
                <input
                  id="topic"
                  className="input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  placeholder="e.g. distributed systems, React performance…"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="pill pill-neutral transition hover:-translate-y-0.5"
                    onClick={() => setTopic(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button className="btn btn-primary min-w-[190px]" onClick={handleStart} disabled={loading || !topic.trim()}>
                  {loading ? <><span className="spinner" /> Creating…</> : <>Begin interview <ArrowRight className="h-4 w-4" /></>}
                </button>
                <button className="btn btn-ghost" onClick={() => router.push("/interviews")}>
                  Browse library
                </button>
              </div>
            </div>
          </div>

          <div className="hidden lg:block">
            <InterviewerAvatar state="idle" size={280} />
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="stats-grid">
        {stats.map((item, idx) => {
          const Icon = STAT_ICONS[idx];
          return (
            <div key={item.label} className="surface kpi-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: "var(--foreground-muted)" }}>{item.label}</p>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ background: "var(--accent-amber-soft)", color: "var(--accent-amber-strong)" }}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="kpi-value">{loadingInterviews ? "—" : item.value}</div>
                <span className="pill pill-neutral">{item.meta}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* recent */}
      <section className="surface p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="brand-wordmark text-xl" style={{ color: "var(--foreground)" }}>Recent sessions</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--foreground-subtle)" }}>Jump back into active or completed interviews.</p>
          </div>
          <button className="btn btn-ghost" onClick={() => router.push("/interviews")}>
            View all <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          {loadingInterviews ? (
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-[72px] rounded-2xl" />)
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "var(--accent-amber-soft)", color: "var(--accent-amber-strong)" }}>
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="text-sm" style={{ color: "var(--foreground-subtle)" }}>No interviews yet — start one above.</p>
            </div>
          ) : (
            recent.map((item) => {
              const done = item.status === "completed";
              return (
                <button
                  key={item.id}
                  className="group surface-subtle flex items-center justify-between gap-4 p-4 text-left transition hover:-translate-y-0.5"
                  style={{ borderRadius: 18 }}
                  onClick={() => router.push(done ? `/results/${item.id}` : `/interview/${item.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl font-semibold"
                      style={{
                        background: done ? "rgba(95,208,163,0.12)" : "var(--accent-teal-soft)",
                        color: done ? "var(--success)" : "var(--accent-teal)",
                      }}
                    >
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <Activity className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold" style={{ color: "var(--foreground)" }}>{item.topic}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--foreground-subtle)" }}>
                        Session #{item.id} · {done ? "Performance ready" : "In progress"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {done && item.score ? (
                      <span className="brand-wordmark text-lg" style={{ color: "var(--accent-amber)" }}>
                        {item.score.toFixed(0)}<span className="text-xs" style={{ color: "var(--foreground-subtle)" }}>/10</span>
                      </span>
                    ) : (
                      <span className="pill pill-live">Live</span>
                    )}
                    <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" style={{ color: "var(--foreground-subtle)" }} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
