import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card as ShadcnCard } from "@/components/ui/card";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { Badge as ShadcnBadge } from "@/components/ui/badge";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <ShadcnCard className={cn("rounded-xl shadow-sm", className)} {...props}>
      {children}
    </ShadcnCard>
  );
}

export function SubtleCard({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl bg-muted/50 border border-muted", className)} {...props}>
      {children}
    </div>
  );
}

export function Button({
  className,
  children,
  variant = "primary",
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const shadcnVariant = variant === "primary" ? "default" : variant;
  return (
    <ShadcnButton variant={shadcnVariant} size={size} className={className} {...props}>
      {children}
    </ShadcnButton>
  );
}

export function Input({
  className,
  icon,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
}) {
  if (icon) {
    return (
      <div className={cn("relative flex items-center", className)}>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center justify-center w-4 h-4">{icon}</div>
        <ShadcnInput className="pl-10 rounded-xl" {...props} />
      </div>
    );
  }
  return <ShadcnInput className={cn("rounded-xl", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <ShadcnTextarea className={cn("rounded-xl min-h-[150px]", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "primary" | "success" | "warning" | "danger" | "neutral";
  className?: string;
  children: ReactNode;
}) {
  const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    primary: "default",
    success: "default",
    warning: "secondary",
    danger: "destructive",
    neutral: "secondary",
  };
  
  const customClasses = 
    tone === "success" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25" :
    tone === "warning" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25" :
    "";

  return <ShadcnBadge variant={variantMap[tone]} className={cn(customClasses, className)}>{children}</ShadcnBadge>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-1">
          <h1 className="brand-wordmark text-3xl tracking-[-0.04em] text-slate-950">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function MetricBar({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  const width = `${Math.max(0, Math.min(100, value * 10))}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-semibold text-slate-900">
          {value.toFixed(1)}
          {hint ? <span className="ml-2 text-xs font-medium text-slate-500">{hint}</span> : null}
        </span>
      </div>
      <div className="metric-track">
        <div className="metric-fill" style={{ width }} />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-10 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M5 7.75A2.75 2.75 0 0 1 7.75 5h8.5A2.75 2.75 0 0 1 19 7.75v8.5A2.75 2.75 0 0 1 16.25 19h-8.5A2.75 2.75 0 0 1 5 16.25z" />
          <path d="M8.5 10.5h7M8.5 13.5h4" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export function ScoreRing({
  score,
  size = 120,
  label = "out of 10",
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(10, score)) / 10) * circumference;
  const tone =
    score >= 8 ? "var(--success)" : score >= 6 ? "var(--warning)" : score >= 4 ? "var(--primary)" : "var(--danger)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="8"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="brand-wordmark text-3xl" style={{ color: tone }}>
          {score.toFixed(0)}
        </div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export { cn };
