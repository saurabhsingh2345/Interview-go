"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getInterviewReport, getInterviewTranscript, InterviewReport, TranscriptEntry } from "../../../lib/api";
import { showToast } from "../../../components/Toast";
import { Badge, Card, MetricBar, PageHeader, ScoreRing, SubtleCard } from "../../../components/ui";

function parseTags(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function phaseLabel(p: string) {
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CandidateReportPage() {
  const params = useParams();
  const interviewId = Number(params.id);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([getInterviewReport(interviewId), getInterviewTranscript(interviewId)])
      .then(([r, t]) => { setReport(r); setTranscript(t.transcript); })
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed to load report", "error"))
      .finally(() => setLoading(false));
  }, [interviewId]);

  if (loading) {
    return (
      <div className="section-grid">
        <PageHeader eyebrow="Your results" title="Loading your report..." description="Fetching scores and transcript." />
      </div>
    );
  }
  if (!report) return null;

  const strengths = parseTags(report.strengths);
  const weaknesses = parseTags(report.weaknesses);

  // Group transcript by phase
  const phaseGroups: Record<string, TranscriptEntry[]> = {};
  for (const entry of transcript) {
    const p = entry.phase || "unknown";
    if (!phaseGroups[p]) phaseGroups[p] = [];
    phaseGroups[p].push(entry);
  }

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Your results"
        title={`Interview #${interviewId}`}
        description="Here's how you did — with a personalised study plan."
      />

      <section className="details-grid">
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="flex items-center gap-8">
              <ScoreRing score={report.overall_score} label="Your score" size={120} />
              <div className="flex-1 space-y-3">
                <MetricBar label="Technical depth" value={report.technical_score} />
                <MetricBar label="Communication clarity" value={report.communication_score} />
                <MetricBar label="Behavioral answers" value={report.behavioral_score} />
                <MetricBar label="Coding accuracy" value={report.coding_score} />
              </div>
            </div>
          </Card>

          {strengths.length > 0 && (
            <Card className="p-6 sm:p-8">
              <h2 className="text-base font-semibold text-emerald-800 mb-4">What you did well</h2>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    <p className="text-sm leading-6 text-slate-700">{s}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {weaknesses.length > 0 && (
            <Card className="p-6 sm:p-8">
              <h2 className="text-base font-semibold text-amber-800 mb-4">Areas to strengthen</h2>
              <ul className="space-y-2">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-amber-500 mt-0.5">→</span>
                    <p className="text-sm leading-6 text-slate-700">{w}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Transcript accordion grouped by phase */}
          {Object.entries(phaseGroups).map(([p, entries]) => (
            <Card key={p} className="p-6 sm:p-8">
              <h2 className="text-base font-semibold text-slate-950 mb-4">{phaseLabel(p)} phase</h2>
              <div className="space-y-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="rounded-[16px] border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50"
                    >
                      <div className="flex gap-1.5 shrink-0 pt-0.5">
                        <Badge tone={entry.score >= 7 ? "success" : entry.score >= 4 ? "warning" : "danger"}>{entry.score}</Badge>
                        {entry.difficulty && <Badge tone="neutral">{entry.difficulty}</Badge>}
                        {entry.is_follow_up && <Badge tone="warning">follow-up</Badge>}
                      </div>
                      <p className="text-sm font-medium text-slate-900 leading-6">{entry.question}</p>
                    </button>
                    {expandedId === entry.id && (
                      <div className="px-4 pb-4 space-y-3">
                        <SubtleCard className="p-3 bg-slate-50">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Your answer</p>
                          <p className="text-sm leading-6 text-slate-700">{entry.answer || "(no answer recorded)"}</p>
                        </SubtleCard>
                        {entry.evaluation?.ai_feedback && (
                          <SubtleCard className="p-3 bg-blue-50 border-blue-100">
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">AI feedback</p>
                            <p className="text-sm leading-6 text-blue-900">{entry.evaluation.ai_feedback}</p>
                          </SubtleCard>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          {report.improvement_plan && (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-950 mb-3">Your 4-week study roadmap</h2>
              <p className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{report.improvement_plan}</p>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}
