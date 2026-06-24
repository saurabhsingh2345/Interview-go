"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getResponseEvaluation, ResponseEvaluation } from "../../lib/api";
import { showToast } from "../../components/Toast";
import { Badge, Button, Card, MetricBar, PageHeader, ScoreRing, SubtleCard } from "../../components/ui";

export default function ResponseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const responseId = Number(params.id);
  const [data, setData] = useState<ResponseEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getResponseEvaluation(responseId)
      .then((result) => {
        setData(result);
      })
      .catch((err: unknown) => {
        showToast(
          err instanceof Error ? err.message : "Failed to load evaluation",
          "error",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [responseId]);

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="skeleton h-72 rounded-[28px]" />
        <div className="skeleton h-[420px] rounded-[28px]" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="p-10 text-center">
        <h2 className="text-xl font-semibold text-slate-950">Evaluation not found</h2>
        <p className="mt-2 text-sm text-slate-600">The selected answer does not have an available evaluation payload.</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={() => router.back()}>Go back</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Response"
        title={`Answer evaluation #${data.response_id}`}
        description="A detailed review of one interview answer, including scoring, AI feedback, and follow-up rationale when available."
        action={<Button variant="secondary" onClick={() => router.back()}>Back</Button>}
      />

      <section className="details-grid">
        <Card className="p-6">
          <div className="flex flex-col items-center text-center">
            <Badge tone="primary">Response score</Badge>
            <div className="mt-6">
              <ScoreRing score={data.score} size={140} />
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-600">
              Use this score as a starting point, then review the written feedback for coaching opportunities.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <MetricBar label="Correctness" value={data.evaluation.correctness} />
            <MetricBar label="Clarity" value={data.evaluation.clarity} />
            <MetricBar label="Depth" value={data.evaluation.depth} />
            <MetricBar label="Confidence" value={data.evaluation.confidence} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Question</p>
            <p className="mt-3 text-base font-semibold leading-7 text-slate-950">{data.question}</p>
          </Card>

          <Card className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Candidate answer</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{data.answer || "No answer provided"}</p>
          </Card>

          {data.evaluation.feedback ? (
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">AI feedback</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">{data.evaluation.feedback}</p>
            </Card>
          ) : null}

          {data.evaluation.suggested ? (
            <SubtleCard className="border-blue-100 bg-blue-50/70 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Suggested answer</p>
              <p className="mt-3 text-sm leading-7 text-slate-700">{data.evaluation.suggested}</p>
            </SubtleCard>
          ) : null}

          {data.follow_up_context ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Follow-up context</Badge>
                <Badge tone="primary">{data.follow_up_context.difficulty}</Badge>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SubtleCard className="p-4">
                  <p className="text-sm font-medium text-slate-900">Concept tested</p>
                  <p className="mt-2 text-sm text-slate-600">{data.follow_up_context.concept_tested}</p>
                </SubtleCard>
                <SubtleCard className="p-4">
                  <p className="text-sm font-medium text-slate-900">Reasoning</p>
                  <p className="mt-2 text-sm text-slate-600">{data.follow_up_context.reasoning}</p>
                </SubtleCard>
              </div>
            </Card>
          ) : null}
        </div>
      </section>
    </div>
  );
}
