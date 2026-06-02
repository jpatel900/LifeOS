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
import { Separator } from "@/components/ui/separator";
import { buildAreaAccentStyle, resolveSelectedArea } from "@/lib/areaAccent";
import { cn } from "@/lib/utils";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { DiagnosticsDisclosure } from "./DiagnosticsDisclosure";

const navLinks = [
  { href: "/capture", label: "Capture" },
  { href: "/triage", label: "Triage" },
  { href: "/calendar", label: "Planning" },
  { href: "/execute", label: "Execute" },
  { href: "/review", label: "Review" },
  { href: "/health", label: "Health" },
  { href: "/settings/areas", label: "Areas" },
];

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

  return (
    <div
      data-testid="app-shell-root"
      style={areaAccentStyle}
      className="relative min-h-screen bg-background"
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
      <header className="sticky top-0 z-40 border-b border-[var(--area-accent-border)] bg-background/90 shadow-[0_16px_40px_-32px_var(--area-accent)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full bg-[var(--area-accent)] shadow-[0_0_0_4px_var(--area-accent-soft)]"
                />
                LifeOS
              </Link>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Personal workflow cockpit
              </Badge>
            </div>
            <div className="flex w-full flex-col gap-1 lg:w-auto lg:items-end">
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <ThemeToggle />
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
                  className="h-9 min-w-0 flex-1 sm:w-56 sm:flex-none"
                />
                <Button
                  type="button"
                  onClick={handleSaveQuickNote}
                  className="w-full sm:w-auto"
                >
                  Save quick note
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Saved on this device only. Review in Triage or Review.
              </p>
              {quickNoteStatus === "error" ? (
                <p className="text-xs text-destructive">
                  Quick note was not saved. Type a note first, or use Capture.
                </p>
              ) : null}
              {quickNoteStatus === "saved" ? (
                <Alert variant="success" className="max-w-sm">
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
              className="flex flex-wrap items-center gap-2 lg:flex-nowrap"
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
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition-colors sm:px-3 sm:text-sm",
                      isActive
                        ? "border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] font-medium text-foreground shadow-[inset_0_1px_0_0_var(--area-accent-soft)]"
                        : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
            <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto lg:flex-nowrap">
              <span className="text-xs text-muted-foreground">Current area</span>
              <Select
                aria-label="Current area"
                value={selectedAreaId ?? ""}
                disabled={!hasAreas}
                onChange={(event) =>
                  setSelectedAreaId(event.target.value || null)
                }
                className="h-9 min-w-0 flex-1 rounded-full border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] shadow-sm sm:min-w-44 sm:flex-none"
              >
                {!hasAreas ? (
                  <option value="">No areas yet</option>
                ) : null}
                {state.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
              <Badge variant="outline" className="rounded-full">
                {now}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl scroll-mt-28 flex-col gap-5 px-4 py-6 focus-visible:outline-none sm:px-6 lg:px-8"
      >
        <div
          aria-label="Current area context"
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--area-accent-border)] bg-[var(--area-accent-surface)] px-4 py-3 shadow-sm"
        >
          <span className="text-sm text-muted-foreground">Current area</span>
          <Badge
            variant="secondary"
            className="rounded-full border border-[var(--area-accent-border)] bg-[var(--area-accent-soft)] text-sm text-foreground"
          >
            {currentArea?.name ?? "No area selected yet"}
          </Badge>
        </div>
        <Separator />
        <DiagnosticsDisclosure>
          <p>Quick capture saves on this device and sends notes to Triage.</p>
          <p>
            Current area: <strong>{currentArea?.name ?? "Not set"}</strong>
          </p>
          <p>
            Technical area id: <strong>{selectedAreaId ?? "none"}</strong>
          </p>
        </DiagnosticsDisclosure>
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
