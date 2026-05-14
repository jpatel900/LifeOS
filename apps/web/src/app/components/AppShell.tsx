"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";

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
  const currentArea =
    state.areas.find((area) => area.id === selectedAreaId) ?? state.areas[0];
  const [now, setNow] = useState("--:--:--");

  useEffect(() => {
    const formatNow = () => new Date().toLocaleTimeString();
    setNow(formatNow());
    const intervalId = window.setInterval(() => {
      setNow(formatNow());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/capture" className="text-xl font-semibold tracking-tight">
                LifeOS
              </Link>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Personal workflow cockpit
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                type="button"
                onClick={() =>
                  submitCaptureText(
                    "Quick capture: sort this thought later.",
                    selectedAreaId,
                  )
                }
              >
                Quick Capture
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            <nav aria-label="Primary" className="flex min-w-max items-center gap-2">
              {navLinks.map((link) => {
                const isActive =
                  pathname === link.href ||
                  (link.href !== "/capture" && pathname?.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex min-w-max items-center gap-2">
              <Select
                aria-label="Current workflow area (session)"
                value={selectedAreaId ?? ""}
                onChange={(event) => setSelectedAreaId(event.target.value || null)}
                className="h-9 min-w-44 rounded-full"
              >
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

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div
          aria-label="Current area context"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-muted-foreground">Current area</span>
          <Badge variant="secondary" className="rounded-full text-sm">
            {currentArea?.name ?? "No area selected"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            Session workflow area: {currentArea?.name ?? "Not set"}
          </span>
        </div>
        <Separator />
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none">System details</summary>
          <p className="mt-2">Workflow area (session)</p>
          <p>Session workflow area: {currentArea?.name ?? "Not set"}</p>
        </details>
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
