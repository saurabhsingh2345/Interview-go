"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getInterviewEvaluation,
  getInterviewResponses,
  InterviewEvaluation,
  InterviewResponseItem,
} from "../../lib/api";
import { showToast } from "../../components/Toast";
import { Badge, Button, Card, MetricBar, PageHeader, ScoreRing, SubtleCard } from "../../components/ui";

function gradeFromScore(score: number) {
  if (score >= 9) return "A+";
  if (score >= 8) return "A";
  if (score >= 7) return "B";
  if (score >= 6) return "C";
  if (score >= 5) return "D";
  return "F";
}

function scoreClass(score: number) {
  if (score >= 8) return "text-emerald-600";
  if (score >= 6) return "text-amber-600";
  if (score >= 4) return "text-blue-600";
  return "text-rose-600";
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = Number(params.id);
  const [evaluation, setEvaluation] = useState<InterviewEvaluation | null>(null);
  const [responses, setResponses] = useState<InterviewResponseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getInterviewEvaluation(interviewId),
      getInterviewResponses(interviewId),
    ])
      .then(([evalData, resData]) => {
        setEvaluation(evalData);
        setResponses(resData.responses || []);
      })
      .catch((err: unknown) => {
        showToast(
          err instanceof Error ? err.message : "Failed to load results",
          "error",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [interviewId]);

  const numericScore = useMemo(
    () => evaluation?.final_score ?? 0,
    [evaluation],
  );

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="skeleton h-60 rounded-[28px]" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="skeleton h-72 rounded-[28px]" />
          <div className="skeleton h-72 rounded-[28px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Results"
        title={evaluation?.topic ?? `Interview #${interviewId}`}
        description="A complete view of interview performance, metric distribution, and answer-level evaluation."
        action={
          <>
            <Button variant="secondary" onClick={() => router.push("/interviews")}>
              Back to interviews
            </Button>
            <Button onClick={() => router.push("/")}>Create another</Button>
          </>
        }
      />

      {evaluation ? (
        <>
          <section className="details-grid">
            <Card className="p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge tone="success">Completed</Badge>
                  <h2 className="mt-4 brand-wordmark text-3xl text-slate-950">
                    Final performance summary
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                    The score below blends correctness, clarity, depth, and confidence across the full interview flow.
                  </p>
                </div>
                <SubtleCard className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Questions answered
                  </p>
                  <p className="mt-2 brand-wordmark text-3xl text-slate-950">
                    {evaluation.total_questions}
                  </p>
                </SubtleCard>
              </div>

              <div className="mt-8 flex flex-col items-center gap-6 rounded-[24px] bg-slate-50 p-6 lg:flex-row lg:justify-between">
                <div className="flex justify-center">
                  <ScoreRing score={numericScore} />
                </div>
                <div className="flex-1">
                  <div className={`brand-wordmark text-5xl ${scoreClass(numericScore)}`}>
                    {gradeFromScore(numericScore)}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Strong interviews show balanced scores rather than a single standout metric. Use the response breakdown below to spot gaps quickly.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-sm font-semibold text-slate-900">Performance breakdown</p>
              <div className="mt-6 space-y-5">
                <MetricBar label="Correctness" value={evaluation.metrics?.correctness ?? 0} />
                <MetricBar label="Clarity" value={evaluation.metrics?.clarity ?? 0} />
                <MetricBar label="Depth" value={evaluation.metrics?.depth ?? 0} />
                <MetricBar label="Confidence" value={evaluation.metrics?.confidence ?? 0} />
              </div>
            </Card>
          </section>

          <section className="section-grid">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Question by question analysis</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Each card opens the detailed evaluation for that answer.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              {responses.map((item, index) => (
                <Card
                  key={item.id}
                  className="p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="primary">Q{index + 1}</Badge>
                        {item.is_follow_up ? <Badge>Follow-up</Badge> : null}
                      </div>
                      <p className="mt-4 text-base font-semibold leading-7 text-slate-950">
                        {item.question}
                      </p>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                        {item.answer || "No answer provided"}
                      </p>

                      {item.follow_ups?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.follow_ups.map((followUp) => (
                            <button
                              key={followUp.id}
                              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                              onClick={() => router.push(`/responses/${followUp.id}`)}
                            >
                              Follow-up #{followUp.id}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-3 lg:flex-col lg:items-end">
                      <div className={`brand-wordmark text-3xl ${scoreClass(item.score)}`}>
                        {item.score.toFixed(0)}
                      </div>
                      <Button variant="secondary" onClick={() => router.push(`/responses/${item.id}`)}>
                        View detail
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
