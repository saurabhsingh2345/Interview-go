"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getInterviewTranscript, TranscriptEntry } from "../../../lib/api";
import { showToast } from "../../../components/Toast";
import { Badge, Card, MetricBar, PageHeader, SubtleCard } from "../../../components/ui";

function phaseLabel(p: string) {
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ReplayPage() {
  const params = useParams();
  const interviewId = Number(params.id);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInterviewTranscript(interviewId)
      .then((data) => setTranscript(data.transcript))
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed to load transcript", "error"))
      .finally(() => setLoading(false));
  }, [interviewId]);

  if (loading) {
    return (
      <div className="section-grid">
        <PageHeader eyebrow="Interview replay" title="Loading transcript..." description="" />
      </div>
    );
  }

  if (transcript.length === 0) {
    return (
      <div className="section-grid">
        <PageHeader eyebrow="Interview replay" title="No responses yet" description="Complete an interview to replay it." />
      </div>
    );
  }

  const entry = transcript[cursor];
  const progress = ((cursor + 1) / transcript.length) * 100;

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Interview replay"
        title={`Interview #${interviewId}`}
        description={`Step ${cursor + 1} of ${transcript.length}`}
      />

      <section className="details-grid">
        <div className="space-y-6">
          {/* Progress */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge tone="primary">{phaseLabel(entry.phase || "unknown")}</Badge>
              {entry.difficulty && <Badge tone="neutral">{entry.difficulty}</Badge>}
              {entry.is_follow_up && <Badge tone="warning">Follow-up</Badge>}
              <Badge tone={entry.score >= 7 ? "success" : entry.score >= 4 ? "warning" : "danger"}>
                Score {entry.score}
              </Badge>
            </div>
            <div className="metric-track mb-6">
              <div className="metric-fill" style={{ width: `${progress}%` }} />
            </div>

            {/* Question */}
            <div className="rounded-[24px] bg-slate-50 p-5 mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">Question {entry.question_num}</p>
              <p className="text-base font-semibold leading-7 text-slate-950">{entry.question}</p>
            </div>

            {/* Answer */}
            <div className="rounded-[24px] bg-white border border-slate-200 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">Answer</p>
              <p className="text-sm leading-7 text-slate-700">{entry.answer || "(no answer recorded)"}</p>
            </div>
          </Card>

          {/* Evaluation */}
          {entry.evaluation && (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-950 mb-4">Evaluation</h2>
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <MetricBar label="Correctness" value={entry.evaluation.correctness} />
                <MetricBar label="Clarity" value={entry.evaluation.clarity} />
                <MetricBar label="Depth" value={entry.evaluation.depth} />
                <MetricBar label="Confidence" value={entry.evaluation.confidence} />
              </div>
              {entry.evaluation.ai_feedback && (
                <SubtleCard className="p-4 bg-blue-50 border-blue-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">Feedback</p>
                  <p className="text-sm leading-6 text-blue-900">{entry.evaluation.ai_feedback}</p>
                </SubtleCard>
              )}
              {entry.evaluation.suggested_answer && (
                <SubtleCard className="mt-3 p-4 bg-emerald-50 border-emerald-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-1">Suggested answer</p>
                  <p className="text-sm leading-6 text-emerald-900">{entry.evaluation.suggested_answer}</p>
                </SubtleCard>
              )}
            </Card>
          )}
        </div>

        {/* Navigation */}
        <div className="space-y-6">
          <Card className="p-6 flex gap-4">
            <button
              onClick={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={cursor === 0}
              className="flex-1 rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              ← Previous
            </button>
            <button
              onClick={() => setCursor((c) => Math.min(transcript.length - 1, c + 1))}
              disabled={cursor === transcript.length - 1}
              className="flex-1 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </Card>

          <Card className="p-6">
            <h2 className="text-sm font-semibold text-slate-950 mb-3">Jump to question</h2>
            <div className="flex flex-wrap gap-2">
              {transcript.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setCursor(i)}
                  className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                    i === cursor
                      ? "bg-blue-600 text-white"
                      : t.score >= 7
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : t.score >= 4
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
