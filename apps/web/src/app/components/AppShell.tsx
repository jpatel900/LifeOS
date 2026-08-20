"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { formatMastheadDate } from "./moments/formatMastheadDate";
import { DemoModeBanner } from "./DemoModeBanner";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

/* #660 audit line S2: this was a second, unrelated masthead — a plain
   `border-b` bar with bare text links, no relation to the moments masthead
   grammar the rest of the app uses (brand+date on the left, a pill-style
   action cluster on the right, single row; see TodayMoments.tsx's own
   `<header>`, D-10 #483). Recomposed to that same grammar: brand + date on
   the left (`text-sm font-semibold`/`text-sm text-muted-foreground`,
   identical type treatment), the two nav destinations as pill links on the
   right (matching the Settings-link pill in TodayMoments.tsx rather than
   bare `hover:text-foreground` text). The date is computed client-side only
   (mirrors the moments masthead's own now-dependent rendering) to avoid an
   SSR/CSR mismatch; admin pages don't need the minute-by-minute self-refresh
   TodayMoments does, so a mount-time value is enough here. */
function AdminShell({ children }: { children: ReactNode }) {
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  useEffect(() => {
    setDateLabel(formatMastheadDate(new Date()));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/95 px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-baseline gap-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              LifeOS · Settings
            </Link>
            {dateLabel ? (
              <span className="text-sm text-muted-foreground">{dateLabel}</span>
            ) : null}
          </div>
          <nav className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/"
              className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Cockpit
            </Link>
            <Link
              href="/settings/areas"
              className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Areas admin
            </Link>
          </nav>
        </div>
      </header>
      {/* #687: the header already centers its own row at `max-w-6xl`, but the
          page content was rendered bare — so `/settings/areas` stretched
          edge-to-edge (title flush to the viewport's left edge), reading as
          an older, inconsistent shell. Wrap children in the same centered,
          padded container so settings sits at the same measure as the rest
          of the app. */}
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/settings");
  const isLogin = pathname?.startsWith("/login");

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <WorkflowProvider>
        <ServiceWorkerRegister />
        <DemoModeBanner />
        {isAdmin ? (
          <AdminShell>{children}</AdminShell>
        ) : isLogin ? (
          children
        ) : (
          children
        )}
      </WorkflowProvider>
    </ThemeProvider>
  );
}
