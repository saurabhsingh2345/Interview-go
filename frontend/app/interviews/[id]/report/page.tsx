"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getInterviewReport, InterviewReport } from "../../../lib/api";
import { showToast } from "../../../components/Toast";
import { Badge, Card, MetricBar, PageHeader, ScoreRing } from "../../../components/ui";

function parseTags(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ScoreBar({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = value >= 7 ? "bg-emerald-500" : value >= 5 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1">
        <span>{label}</span>
        <span className="font-semibold">{value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const interviewId = Number(params.id);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInterviewReport(interviewId)
      .then(setReport)
      .catch((e: unknown) => showToast(e instanceof Error ? e.message : "Failed to load report", "error"))
      .finally(() => setLoading(false));
  }, [interviewId]);

  if (loading) {
    return (
      <div className="section-grid">
        <PageHeader eyebrow="Recruiter report" title="Generating report..." description="Computing scores and narrative — this may take a moment." />
      </div>
    );
  }
  if (!report) return null;

  const strengths = parseTags(report.strengths);
  const weaknesses = parseTags(report.weaknesses);

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Recruiter report"
        title={`Interview #${interviewId}`}
        description="Multi-dimensional hiring signal report."
      />

      <section className="details-grid">
        <div className="space-y-6">
          {/* Score ring + bars */}
          <Card className="p-6 sm:p-8">
            <div className="flex items-center gap-8">
              <ScoreRing score={report.overall_score} label="Overall" size={120} />
              <div className="flex-1 space-y-3">
                <ScoreBar label="Technical" value={report.technical_score} />
                <ScoreBar label="Communication" value={report.communication_score} />
                <ScoreBar label="Behavioral" value={report.behavioral_score} />
                <ScoreBar label="Coding" value={report.coding_score} />
                <ScoreBar label="Consistency" value={report.consistency_score} />
                <ScoreBar label="Confidence calibration" value={report.confidence_calibration_score} />
              </div>
            </div>
          </Card>

          {/* Strengths */}
          {strengths.length > 0 && (
            <Card className="p-6 sm:p-8">
              <h2 className="text-base font-semibold text-slate-950 mb-4">Strengths</h2>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Badge tone="success">+</Badge>
                    <p className="text-sm leading-6 text-slate-700">{s}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Weaknesses */}
          {weaknesses.length > 0 && (
            <Card className="p-6 sm:p-8">
              <h2 className="text-base font-semibold text-slate-950 mb-4">Gaps</h2>
              <ul className="space-y-2">
                {weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Badge tone="warning">!</Badge>
                    <p className="text-sm leading-6 text-slate-700">{w}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Improvement plan */}
          {report.improvement_plan && (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-950 mb-3">4-week improvement plan</h2>
              <p className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{report.improvement_plan}</p>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-950 mb-3">Dimension guide</h2>
            <div className="space-y-2 text-sm text-slate-600">
              <p><span className="font-semibold">Technical (35%):</span> fundamentals + deep technical phases</p>
              <p><span className="font-semibold">Coding (20%):</span> live coding challenge accuracy</p>
              <p><span className="font-semibold">Behavioral (20%):</span> STAR framework scoring</p>
              <p><span className="font-semibold">Communication (15%):</span> clarity across all phases</p>
              <p><span className="font-semibold">Consistency (5%):</span> variance across repeated concepts</p>
              <p><span className="font-semibold">Confidence calibration (5%):</span> expressed vs actual confidence</p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
