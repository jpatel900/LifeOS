"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { buildAreaAccentStyle, resolveSelectedArea } from "@/lib/areaAccent";
import { cn } from "@/lib/utils";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { DiagnosticsDisclosure } from "./DiagnosticsDisclosure";
import { WorkflowPageHeader } from "./WorkflowPageHeader";

const primaryNavLinks = [
  { href: "/capture", label: "Capture" },
  { href: "/triage", label: "Triage" },
  { href: "/calendar", label: "Planning" },
  { href: "/execute", label: "Execute" },
  { href: "/review", label: "Review" },
  { href: "/health", label: "Health" },
];

const supportingNavLinks = [{ href: "/settings/areas", label: "Areas admin" }];

const quietShellContextRoutes = new Set([
  "/",
  "/capture",
  "/calendar",
  "/execute",
  "/review",
]);

function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, selectedAreaId, setSelectedAreaId, submitCaptureText } =
    useWorkflow();
  const currentArea = resolveSelectedArea(state.areas, selectedAreaId);
  const hasAreas = state.areas.length > 0;
  const [now, setNow] = useState("--:--:--");
  const [quickNoteText, setQuickNoteText] = useState("");
  const [isQuickNoteOpen, setIsQuickNoteOpen] = useState(false);
  const [quickNoteStatus, setQuickNoteStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const areaAccentStyle = buildAreaAccentStyle(currentArea?.color);
  const showQuickNote = pathname !== "/" && pathname !== "/capture";
  const usesQuietShellContext = quietShellContextRoutes.has(pathname ?? "");

  useEffect(() => {
    const formatNow = () => new Date().toLocaleTimeString();
    setNow(formatNow());
    const intervalId = window.setInterval(() => {
      setNow(formatNow());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    setIsQuickNoteOpen(false);
    setQuickNoteText("");
    setQuickNoteStatus("idle");
  }, [pathname]);

  function handleSaveQuickNote() {
    const value = quickNoteText.trim();
    if (!value) {
      setQuickNoteStatus("error");
      return;
    }

    try {
      submitCaptureText(value, selectedAreaId);
      setQuickNoteText("");
      setIsQuickNoteOpen(false);
      setQuickNoteStatus("saved");
    } catch {
      setQuickNoteStatus("error");
    }
  }

  return (
    <div
      data-testid="app-shell-root"
      style={areaAccentStyle}
      className="workflow-shell relative min-h-screen bg-background"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:border focus:border-[var(--area-accent-border)] focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--area-accent)]"
      >
        Skip to main content
      </a>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[var(--area-accent-border)]"
      />
      <header
        className={cn(
          "workflow-shell__header sticky top-0 z-40 border-b border-[var(--area-accent-border)] bg-background/88 backdrop-blur-xl",
          usesQuietShellContext && "workflow-shell__header--quiet",
        )}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="workflow-shell__masthead flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight transition-transform duration-200 hover:-translate-y-0.5"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full bg-[var(--area-accent)] shadow-[0_0_0_4px_var(--area-accent-soft)]"
                />
                LifeOS
              </Link>
              <Badge
                variant="secondary"
                className="workflow-shell-panel hidden rounded-full sm:inline-flex"
              >
                Personal workflow cockpit
              </Badge>
            </div>
            <div className="workflow-shell__quick-note flex w-full flex-col gap-2 lg:w-auto lg:min-w-[18rem] lg:items-end">
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <ThemeToggle />
                {showQuickNote ? (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-expanded={isQuickNoteOpen}
                    aria-controls="shell-quick-note-composer"
                    onClick={() => {
                      setIsQuickNoteOpen((current) => !current);
                      if (quickNoteStatus === "saved") {
                        setQuickNoteStatus("idle");
                      }
                    }}
                    className="h-10 rounded-full border border-white/10 bg-white/4 px-4"
                  >
                    {isQuickNoteOpen ? "Hide quick note" : "Quick note"}
                  </Button>
                ) : null}
              </div>
              {showQuickNote && isQuickNoteOpen ? (
                <div
                  id="shell-quick-note-composer"
                  className="workflow-shell-panel flex w-full flex-col gap-2 rounded-2xl p-3 lg:max-w-sm"
                >
                  <p className="text-xs text-muted-foreground">
                    Saved on this device only. Review in Triage or Review.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Quick note text"
                      value={quickNoteText}
                      onChange={(event) => {
                        setQuickNoteText(event.target.value);
                        if (quickNoteStatus !== "idle") {
                          setQuickNoteStatus("idle");
                        }
                      }}
                      placeholder="Type a quick note"
                      className="h-10 min-w-0 flex-1 rounded-2xl border-white/10 bg-white/4"
                    />
                    <Button
                      type="button"
                      onClick={handleSaveQuickNote}
                      className="h-10 w-full rounded-full px-4 shadow-none sm:w-auto"
                    >
                      Save quick note
                    </Button>
                  </div>
                  {quickNoteStatus === "error" ? (
                    <p className="text-xs text-destructive">
                      Quick note was not saved. Type a note first, or use
                      Capture.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {showQuickNote && quickNoteStatus === "saved" ? (
                <Alert
                  variant="success"
                  role="status"
                  aria-live="polite"
                  className="max-w-sm rounded-2xl px-3 py-2 lg:text-right"
                >
                  <AlertTitle>Saved.</AlertTitle>
                  <AlertDescription>
                    Review it in{" "}
                    <Link
                      href="/triage"
                      className="underline underline-offset-2"
                    >
                      Triage
                    </Link>{" "}
                    or{" "}
                    <Link
                      href="/review"
                      className="underline underline-offset-2"
                    >
                      Review
                    </Link>
                    .
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 pb-1 lg:flex-row lg:items-center">
            <nav
              aria-label="Primary"
              className="workflow-shell__nav workflow-shell-panel flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {primaryNavLinks.map((link) => {
                const isActive =
                  pathname === link.href ||
                  (link.href !== "/capture" && pathname?.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all duration-200 ease-out sm:px-3.5",
                      isActive
                        ? "border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] font-medium text-foreground shadow-[inset_0_1px_0_0_var(--area-accent-soft),0_10px_20px_-22px_var(--area-accent)]"
                        : "border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/4 hover:text-accent-foreground",
                    )}
                  >
                    {isActive ? (
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full bg-[var(--area-accent)]"
                      />
                    ) : null}
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="workflow-shell__status flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto lg:flex-nowrap">
              <nav
                aria-label="Supporting"
                data-testid="app-shell-supporting-nav"
                className="workflow-shell-panel flex items-center gap-2"
              >
                {supportingNavLinks.map((link) => {
                  const isActive =
                    pathname === link.href || pathname?.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all duration-200 ease-out sm:px-3.5",
                        isActive
                          ? "border-[var(--area-accent-border)] bg-[var(--area-accent-soft)] font-medium text-foreground"
                          : "border-transparent text-muted-foreground hover:border-white/8 hover:bg-white/4 hover:text-foreground",
                      )}
                    >
                      {isActive ? (
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full bg-[var(--area-accent)]"
                        />
                      ) : null}
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <div
                aria-label="Current area context"
                className="workflow-shell-panel flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap"
              >
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Area
                </span>
                <Select
                  aria-label="Current area"
                  value={selectedAreaId ?? ""}
                  disabled={!hasAreas}
                  onChange={(event) =>
                    setSelectedAreaId(event.target.value || null)
                  }
                  className="h-10 min-w-0 flex-1 rounded-full border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] shadow-none sm:min-w-44 sm:flex-none"
                >
                  {!hasAreas ? <option value="">No areas yet</option> : null}
                  {state.areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </Select>
                <Badge
                  variant="outline"
                  className="flex h-10 items-center rounded-full border-white/10 bg-white/4 px-3"
                >
                  {now}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "workflow-shell__main mx-auto flex w-full max-w-7xl scroll-mt-28 flex-col gap-6 px-4 py-6 focus-visible:outline-none sm:px-6 lg:px-8",
          usesQuietShellContext && "workflow-shell__main--shell-quiet",
        )}
      >
        {!usesQuietShellContext ? (
          <WorkflowPageHeader
            className="workflow-shell-context-header"
            bodyClassName="workflow-shell-context-body"
          >
            <DiagnosticsDisclosure
              title="Quick capture details"
              data-testid="app-shell-context-header"
            >
              <p>
                Quick capture saves on this device and sends notes to Triage.
              </p>
            </DiagnosticsDisclosure>
          </WorkflowPageHeader>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <WorkflowProvider>
        <AppChrome>{children}</AppChrome>
      </WorkflowProvider>
    </ThemeProvider>
  );
}
