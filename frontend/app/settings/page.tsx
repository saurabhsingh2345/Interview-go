"use client";

import { useTheme } from "../components/ThemeProvider";
import { Badge, Button, Card, PageHeader, SubtleCard } from "../components/ui";

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Settings"
        title="Workspace preferences"
        description="A lightweight settings surface for the interview team. This keeps the SaaS navigation complete without introducing unnecessary backend requirements."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Interview defaults</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Recommended conventions for interview setup and review. These are presentational guidance cards only.
              </p>
            </div>
            <Badge tone="primary">Preview</Badge>
          </div>

          <div className="mt-6 space-y-4">
            <SubtleCard className="p-4">
              <p className="font-medium text-slate-900">Topic naming</p>
              <p className="mt-1 text-sm text-slate-600">
                Use role + competency format such as “Frontend: React performance” or “Backend: Go concurrency”.
              </p>
            </SubtleCard>
            <SubtleCard className="p-4">
              <p className="font-medium text-slate-900">Review cadence</p>
              <p className="mt-1 text-sm text-slate-600">
                Review scores immediately after each session to keep interviewer calibration consistent.
              </p>
            </SubtleCard>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Theme preferences</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose how the interface should render across the full app shell and all shared surfaces.
              </p>
            </div>
            <Badge tone="success">{resolvedTheme}</Badge>
          </div>

          <div className="mt-6 grid gap-3">
            {[
              {
                value: "light",
                title: "Light",
                copy: "Bright workspace with soft contrast for daytime usage.",
              },
              {
                value: "dark",
                title: "Dark",
                copy: "Low-glare interface for focus-heavy sessions and dim environments.",
              },
              {
                value: "system",
                title: "System",
                copy: "Automatically follows the operating system preference.",
              },
            ].map((option) => {
              const active = theme === option.value;

              return (
                <button
                  key={option.value}
                  className={`theme-option ${active ? "active" : ""}`}
                  onClick={() => setTheme(option.value as "light" | "dark" | "system")}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{option.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{option.copy}</div>
                  </div>
                  <div className="theme-radio" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Workspace status</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This page intentionally stays minimal until real settings endpoints are introduced.
          </p>

          <div className="mt-6 grid gap-4">
            <SubtleCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">UI theme</p>
                  <p className="mt-1 text-sm text-slate-600">Production-ready SaaS dashboard theme applied.</p>
                </div>
                <Badge tone="success">Active</Badge>
              </div>
            </SubtleCard>
            <SubtleCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">Backend integration</p>
                  <p className="mt-1 text-sm text-slate-600">No API behavior changed during the redesign.</p>
                </div>
                <Badge tone="success">Preserved</Badge>
              </div>
            </SubtleCard>
          </div>

          <div className="mt-6">
            <Button variant="secondary" disabled>
              Settings API coming later
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
