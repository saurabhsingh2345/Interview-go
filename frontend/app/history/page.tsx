"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Interview, listInterviews } from "../lib/api";
import { showToast } from "../components/Toast";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "../components/ui";

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "warning";
  return "neutral";
}

function scoreTone(score: number): string {
  if (score >= 8) return "text-emerald-600";
  if (score >= 6) return "text-amber-600";
  if (score >= 4) return "text-blue-600";
  return "text-rose-600";
}

function HistoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const query = searchParams.get("q") ?? "";

  async function loadInterviews() {
    setLoading(true);
    try {
      const data = await listInterviews();
      setInterviews(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to load interviews",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

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
        setLoading(false);
      });
  }, []);

  const filteredInterviews = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return interviews;
    return interviews.filter((item) => item.topic.toLowerCase().includes(search));
  }, [interviews, query]);

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Interviews"
        title="Manage interview sessions"
        description="Browse every session, jump back into in-progress interviews, and review completed results without leaving the workspace."
        action={<Button onClick={() => router.push("/")}>Create interview</Button>}
      />

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="w-full max-w-md">
              <Input
                key={query}
                value={query}
                onChange={(event) => {
                  const value = event.target.value;
                  router.replace(value ? `/interviews?q=${encodeURIComponent(value)}` : "/interviews");
                }}
                placeholder="Filter by topic"
              />
            </div>
            <Button variant="secondary" onClick={loadInterviews}>
              Refresh
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>{filteredInterviews.length} shown</span>
            <span className="text-slate-300">/</span>
            <span>{interviews.length} total</span>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="skeleton h-28 rounded-3xl" />
          ))}
        </div>
      ) : filteredInterviews.length === 0 ? (
        <EmptyState
          title={interviews.length === 0 ? "No interviews yet" : "No matches found"}
          description={
            interviews.length === 0
              ? "Create your first interview to start building a reusable session library."
              : "Try a different topic keyword or clear the current filter."
          }
          action={<Button onClick={() => router.push("/")}>Start interview</Button>}
        />
      ) : (
        <div className="grid gap-4">
          {filteredInterviews.map((item) => {
            const isCompleted = item.status === "completed";
            const numericScore = parseFloat(item.score) || 0;

            return (
              <Card
                key={item.id}
                className="p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-slate-950">{item.topic}</h3>
                      <Badge tone={statusTone(item.status)}>
                        {isCompleted ? "Completed" : item.status === "in_progress" ? "In progress" : item.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                      <span>Interview #{item.id}</span>
                      <span className="status-dot text-slate-300" />
                      <span>{isCompleted ? "Results ready for review" : "Resume to continue the interview flow"}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
                      <div className={`brand-wordmark text-2xl ${isCompleted ? scoreTone(numericScore) : "text-slate-900"}`}>
                        {isCompleted ? `${numericScore.toFixed(0)}/10` : "--"}
                      </div>
                      <div className="text-xs font-medium text-slate-500">
                        {isCompleted ? "Final score" : "Awaiting completion"}
                      </div>
                    </div>
                    <Button
                      variant={isCompleted ? "secondary" : "primary"}
                      onClick={() =>
                        router.push(isCompleted ? `/results/${item.id}` : `/interview/${item.id}`)
                      }
                    >
                      {isCompleted ? "View results" : "Continue"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-[28px]" />}>
      <HistoryPageContent />
    </Suspense>
  );
}
