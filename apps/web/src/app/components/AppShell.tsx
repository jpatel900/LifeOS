"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { DemoModeBanner } from "./DemoModeBanner";

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/95 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/" className="font-semibold">
            LifeOS
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground"
            >
              Cockpit
            </Link>
            <Link
              href="/settings/areas"
              className="text-muted-foreground hover:text-foreground"
            >
              Areas admin
            </Link>
          </nav>
        </div>
      </header>
      {children}
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
