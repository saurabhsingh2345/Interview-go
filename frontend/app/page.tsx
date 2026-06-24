"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createInterview, Interview, listInterviews } from "./lib/api";
import { showToast } from "./components/Toast";
import { Badge, Button, Card, EmptyState, Input, PageHeader, SubtleCard, cn } from "./components/ui";

function SearchSpark() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 2v4M10 14v4M18 10h-4M6 10H2M15.66 4.34l-2.83 2.83M7.17 12.83l-2.83 2.83M15.66 15.66l-2.83-2.83M7.17 7.17 4.34 4.34" />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState(true);

  useEffect(() => {
    listInterviews()
      .then((data) => {
        setInterviews(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        showToast(
          err instanceof Error ? err.message : "Failed to load interviews",
          "error",
        );
      })
      .finally(() => {
        setLoadingInterviews(false);
      });
  }, []);

  const dashboardStats = useMemo(() => {
    const completed = interviews.filter((item) => item.status === "completed");
    const inProgress = interviews.filter((item) => item.status === "in_progress");
    const averageScore =
      completed.length > 0
        ? completed.reduce((sum, item) => sum + (parseFloat(item.score) || 0), 0) / completed.length
        : 0;

    return [
      { label: "Total interviews", value: `${interviews.length}`, meta: "All created sessions" },
      { label: "In progress", value: `${inProgress.length}`, meta: "Awaiting completion" },
      { label: "Completed", value: `${completed.length}`, meta: "Ready for review" },
      { label: "Average score", value: completed.length ? averageScore.toFixed(1) : "--", meta: "Across completed interviews" },
    ];
  }, [interviews]);

  const recentInterviews = interviews.slice(0, 4);

  const handleStart = async () => {
    const trimmed = topic.trim();
    if (!trimmed) {
      showToast("Please enter an interview topic", "error");
      return;
    }

    setLoading(true);
    try {
      const data = await createInterview(trimmed);
      showToast("Interview created successfully", "success");
      router.push(`/interview/${data.id}`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to create interview",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Dashboard"
        title="Run high-signal interview sessions"
        description="Create focused interview tracks, monitor active sessions, and review candidate performance in one workspace."
        action={<Button variant="secondary" onClick={() => router.push("/interviews")}>View all interviews</Button>}
      />

      <section className="stats-grid">
        {dashboardStats.map((item) => (
          <Card key={item.label} className="kpi-card">
            <p className="text-sm font-medium text-slate-500">{item.label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="kpi-value">{item.value}</div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {item.meta}
              </span>
            </div>
          </Card>
        ))}
      </section>

      <section className="dashboard-grid">
        <Card className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge tone="primary">Create interview</Badge>
              <h2 className="mt-4 brand-wordmark text-2xl text-slate-950">
                Launch a new interview flow
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Start with a topic and the platform will generate a guided question flow, capture answers, and evaluate each response automatically.
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <label htmlFor="topic-input" className="label">
                Interview topic
              </label>
              <Input
                id="topic-input"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. React architecture, system design, Go concurrency"
                icon={<SearchSpark />}
              />
              <p className="mt-3 text-sm text-slate-500">
                Keep topics specific so follow-up questions stay sharp and relevant.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  className="min-w-[180px]"
                  onClick={handleStart}
                  disabled={loading || !topic.trim()}
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Creating interview
                    </>
                  ) : (
                    "Start interview"
                  )}
                </Button>
                <Button variant="ghost" onClick={() => router.push("/interviews")}>
                  Review previous sessions
                </Button>
              </div>
            </div>

            <SubtleCard className="p-5">
              <p className="text-sm font-semibold text-slate-900">Session design tips</p>
              <div className="mt-4 space-y-4 text-sm leading-6 text-slate-600">
                <p>Use topic names that reflect the exact competency you want to evaluate.</p>
                <p>Completed sessions unlock granular answer-level scoring and feedback.</p>
                <p>Follow-up prompts are most useful when the first answer has enough detail to evaluate.</p>
              </div>
            </SubtleCard>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Recent interviews</p>
                <p className="mt-1 text-sm text-slate-500">Fast access to active and completed sessions.</p>
              </div>
              <Button variant="ghost" onClick={() => router.push("/interviews")}>
                Open library
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              {loadingInterviews ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="skeleton h-20 rounded-2xl" />
                ))
              ) : recentInterviews.length === 0 ? (
                <EmptyState
                  title="No interviews yet"
                  description="Create your first interview to populate the workspace and start tracking results."
                />
              ) : (
                recentInterviews.map((item) => {
                  const isCompleted = item.status === "completed";
                  const tone = isCompleted ? "success" : item.status === "in_progress" ? "warning" : "neutral";

                  return (
                    <button
                      key={item.id}
                      className={cn(
                        "w-full rounded-2xl border border-slate-200 bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
                      )}
                      onClick={() =>
                        router.push(isCompleted ? `/results/${item.id}` : `/interview/${item.id}`)
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{item.topic}</p>
                          <p className="mt-1 text-sm text-slate-500">Interview #{item.id}</p>
                        </div>
                        <Badge tone={tone}>{isCompleted ? "Completed" : "In progress"}</Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                        <span>{isCompleted ? "Review performance breakdown" : "Continue active interview"}</span>
                        <span className="font-semibold text-slate-900">
                          {isCompleted && item.score ? `${parseFloat(item.score).toFixed(0)}/10` : "Open"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
