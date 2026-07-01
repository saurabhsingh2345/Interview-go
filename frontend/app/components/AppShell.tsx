"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { Input, cn } from "./ui";
import { Sun, Moon, Monitor, LayoutDashboard, MessagesSquare, Settings, Search, Plus } from "lucide-react";

const navigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Interviews", href: "/interviews", icon: MessagesSquare },
  { label: "Settings", href: "/settings", icon: Settings },
];

function titleFor(pathname: string) {
  if (pathname.startsWith("/interview/")) return ["Live Session", "Active interview"];
  if (pathname.startsWith("/results/")) return ["Performance Review", "Interview summary"];
  if (pathname.startsWith("/responses/")) return ["Response Detail", "Answer evaluation"];
  if (pathname.startsWith("/settings")) return ["Workspace", "Settings"];
  if (pathname.startsWith("/interviews") || pathname.startsWith("/history")) return ["Library", "All interviews"];
  return ["Overview", "Interview studio"];
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get("q") ?? "").trim();
    router.push(value ? `/interviews?q=${encodeURIComponent(value)}` : "/interviews");
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const [eyebrow, heading] = titleFor(pathname);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="flex items-center gap-3 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/enfeca-logo.svg" alt="Enfeca" className="h-8 w-auto" />
          <div>
            <div className="brand-wordmark text-lg" style={{ color: "var(--foreground)" }}>
              Enfeca<span style={{ color: "var(--accent-amber)" }}> Interview</span>
            </div>
            <div className="text-xs" style={{ color: "var(--sidebar-muted)" }}>AI Interview Studio</div>
          </div>
        </div>

        <nav className="mt-9 flex flex-col gap-1.5">
          <p className="eyebrow px-2 pb-2">Menu</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={cn("nav-link w-full", isActive(item.href) && "active")}
                onClick={() => router.push(item.href)}
              >
                <Icon className="nav-ico h-[18px] w-[18px]" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div
            className="rounded-3xl border p-5"
            style={{ borderColor: "var(--sidebar-border)", background: "color-mix(in srgb, var(--accent-amber) 7%, transparent)" }}
          >
            <div className="flex items-center gap-2">
              <span className="status-dot" style={{ color: "var(--accent-teal)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Studio tip</span>
            </div>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--sidebar-muted)" }}>
              Speak naturally — Enfeca listens, follows up, and scores each answer in real time.
            </p>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="min-w-0">
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="mt-1 brand-wordmark text-xl" style={{ color: "var(--foreground)" }}>{heading}</h2>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
            <form onSubmit={handleSearchSubmit} className="hidden w-full max-w-sm md:block">
              <Input
                key={`${pathname}-${query}`}
                name="q"
                icon={<Search className="h-4 w-4" />}
                defaultValue={query}
                placeholder="Search interviews…"
              />
            </form>
            <button
              className="btn btn-ghost hidden h-11 w-11 !min-h-0 !p-0 md:inline-flex"
              onClick={() => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")}
              title="Toggle theme"
            >
              {mounted ? (
                theme === "light" ? <Sun className="h-5 w-5" /> : theme === "dark" ? <Moon className="h-5 w-5" /> : <Monitor className="h-5 w-5" />
              ) : (
                <div className="h-5 w-5" />
              )}
            </button>
            <button className="btn btn-primary" onClick={() => router.push("/")}>
              <Plus className="h-4 w-4" />
              New interview
            </button>
          </div>
        </header>

        <div className="mobile-nav lg:hidden">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={cn("nav-link whitespace-nowrap", isActive(item.href) && "active")}
                onClick={() => router.push(item.href)}
              >
                <Icon className="nav-ico h-[18px] w-[18px]" />
                {item.label}
              </button>
            );
          })}
        </div>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
