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

const navLinks = [
  { href: "/capture", label: "Capture" },
  { href: "/triage", label: "Triage" },
  { href: "/calendar", label: "Planning" },
  { href: "/execute", label: "Execute" },
  { href: "/review", label: "Review" },
  { href: "/health", label: "Health" },
  { href: "/settings/areas", label: "Areas" },
];

const quietShellContextRoutes = new Set([
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
  const [quickNoteStatus, setQuickNoteStatus] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const areaAccentStyle = buildAreaAccentStyle(currentArea?.color);
  const showQuickNote = pathname !== "/";
  const usesQuietShellContext = quietShellContextRoutes.has(pathname ?? "");

  useEffect(() => {
    const formatNow = () => new Date().toLocaleTimeString();
    setNow(formatNow());
    const intervalId = window.setInterval(() => {
      setNow(formatNow());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  function handleSaveQuickNote() {
    const value = quickNoteText.trim();
    if (!value) {
      setQuickNoteStatus("error");
      return;
    }

    try {
      submitCaptureText(value, selectedAreaId);
      setQuickNoteText("");
      setQuickNoteStatus("saved");
    } catch {
      setQuickNoteStatus("error");
    }
  }

  const currentAreaSpotlight = (
    <div
      aria-label="Current area context"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-sm text-muted-foreground">Current area</span>
      <Badge
        variant="secondary"
        className="rounded-full border border-[var(--area-accent-border)] bg-[var(--area-accent-soft)] text-sm text-foreground"
      >
        {currentArea?.name ?? "No area selected yet"}
      </Badge>
    </div>
  );

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
            <div className="workflow-shell__quick-note flex w-full flex-col gap-2 lg:w-auto lg:min-w-[22rem] lg:items-end">
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <ThemeToggle />
                {showQuickNote ? (
                  <>
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
                      className="h-9 min-w-0 flex-1 rounded-full border-white/10 bg-white/4 sm:w-56 sm:flex-none"
                    />
                    <Button
                      type="button"
                      onClick={handleSaveQuickNote}
                      className="w-full rounded-full shadow-[0_18px_36px_-24px_var(--area-accent)] sm:w-auto"
                    >
                      Save quick note
                    </Button>
                  </>
                ) : null}
              </div>
              {showQuickNote ? (
                <p className="text-xs text-muted-foreground lg:max-w-sm lg:text-right">
                  Saved on this device only. Review in Triage or Review.
                </p>
              ) : null}
              {showQuickNote && quickNoteStatus === "error" ? (
                <p className="text-xs text-destructive lg:max-w-sm lg:text-right">
                  Quick note was not saved. Type a note first, or use Capture.
                </p>
              ) : null}
              {showQuickNote && quickNoteStatus === "saved" ? (
                <Alert
                  variant="success"
                  className="workflow-celebration-alert max-w-sm rounded-2xl"
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
                  <div className="workflow-celebration-meta">
                    <span className="workflow-celebration-chip">
                      Device-only
                    </span>
                    <span className="workflow-celebration-chip">
                      Inbox to Triage
                    </span>
                  </div>
                </Alert>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 pb-1 lg:flex-row lg:items-center">
            <nav
              aria-label="Primary"
              className="workflow-shell__nav workflow-shell-panel flex flex-wrap items-center gap-2 lg:flex-nowrap"
            >
              {navLinks.map((link) => {
                const isActive =
                  pathname === link.href ||
                  (link.href !== "/capture" && pathname?.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition-all duration-200 ease-out sm:px-3 sm:text-sm",
                      isActive
                        ? "border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] font-medium text-foreground shadow-[inset_0_1px_0_0_var(--area-accent-soft),0_14px_28px_-24px_var(--area-accent)]"
                        : "border-transparent text-muted-foreground hover:-translate-y-0.5 hover:border-white/8 hover:bg-white/4 hover:text-accent-foreground",
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
            <div className="workflow-shell__status workflow-shell-panel flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto lg:flex-nowrap">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Current area
              </span>
              <Select
                aria-label="Current area"
                value={selectedAreaId ?? ""}
                disabled={!hasAreas}
                onChange={(event) =>
                  setSelectedAreaId(event.target.value || null)
                }
                className="h-9 min-w-0 flex-1 rounded-full border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] shadow-[0_16px_30px_-28px_var(--area-accent)] sm:min-w-44 sm:flex-none"
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
                className="rounded-full border-white/10 bg-white/4"
              >
                {now}
              </Badge>
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
            spotlight={currentAreaSpotlight}
            spotlightClassName="workflow-shell-context-spotlight"
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
