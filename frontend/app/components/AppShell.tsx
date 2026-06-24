"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "./ThemeProvider";
import { Button, Input, cn } from "./ui";
import { Sun, Moon, Monitor } from "lucide-react";

const navigation = [
  { label: "Dashboard", href: "/" },
  { label: "Interviews", href: "/interviews" },
  { label: "Settings", href: "/settings" },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="9" r="5.75" />
      <path d="m13.5 13.5 3.25 3.25" />
    </svg>
  );
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

    if (!value) {
      router.push("/interviews");
      return;
    }

    router.push(`/interviews?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-lg text-white shadow-lg">
            VI
          </div>
          <div>
            <div className="brand-wordmark text-lg text-white">VoxInterview</div>
            <div className="text-sm text-slate-400">Interview operations</div>
          </div>
        </div>

        <nav className="mt-10 flex flex-col gap-2">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <button
                key={item.label}
                className={cn(
                  "flex items-center rounded-2xl px-4 py-3 text-left text-sm font-medium transition",
                  active
                    ? "bg-card text-slate-950 shadow-lg"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                )}
                onClick={() => router.push(item.href)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-3xl border border-white/10 bg-white/6 p-5 text-white/90">
          <div className="text-sm font-semibold">Interview quality</div>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Keep sessions concise, review scores after each run, and use follow-up prompts to deepen candidate signal.
          </p>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {pathname.startsWith("/interview/")
                ? "Live Session"
                : pathname.startsWith("/results/")
                ? "Performance Review"
                : pathname.startsWith("/responses/")
                ? "Response Detail"
                : pathname.startsWith("/settings")
                ? "Workspace Settings"
                : pathname.startsWith("/interviews") || pathname.startsWith("/history")
                ? "Interview Library"
                : "Dashboard"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {pathname.startsWith("/interview/")
                ? "Active interview"
                : pathname.startsWith("/results/")
                ? "Interview summary"
                : pathname.startsWith("/responses/")
                ? "Answer evaluation"
                : pathname.startsWith("/settings")
                ? "Team preferences"
                : pathname.startsWith("/interviews") || pathname.startsWith("/history")
                ? "All interviews"
                : "Interview operations overview"}
            </h2>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
            <form onSubmit={handleSearchSubmit} className="hidden w-full max-w-md md:block">
              <Input
                key={`${pathname}-${query}`}
                name="q"
                icon={<SearchIcon />}
                defaultValue={query}
                placeholder="Search interviews or topics"
              />
            </form>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              onClick={() => setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")}
              title="Toggle Theme"
            >
              {mounted ? (
                theme === "light" ? (
                  <Sun className="h-5 w-5" />
                ) : theme === "dark" ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Monitor className="h-5 w-5" />
                )
              ) : (
                <div className="h-5 w-5" />
              )}
            </Button>
            <Button variant="secondary" onClick={() => router.push("/")}>
              Create
            </Button>
          </div>
        </header>

        <div className="mobile-nav lg:hidden">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <button
                key={item.label}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition",
                  active ? "bg-slate-900 text-slate-50" : "bg-card text-slate-600 shadow-sm ring-1 ring-slate-200",
                )}
                onClick={() => router.push(item.href)}
              >
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
