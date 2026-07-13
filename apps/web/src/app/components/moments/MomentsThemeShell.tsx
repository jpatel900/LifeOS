"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// #501: `.lifeos-cockpit`'s hex token axis only flips to light via
// `.lifeos-cockpit[data-theme="light"]` (globals.css), but the moments home
// shell (page.tsx) never set `data-theme`, so it stayed dark under the
// light-styled controls the rest of the app switches to via next-themes
// (html.light/.dark, localStorage key "theme", AppShell's ThemeProvider).
// This wraps the shell in a client boundary that mirrors next-themes'
// resolvedTheme onto `data-theme`, without touching LifeOSCockpit's separate
// `lifeos.cockpit.preferences` theme store (explicitly out of scope — #501
// defers that unification).
//
// Same mounted-guard pattern as theme-toggle.tsx: next-themes only knows the
// persisted/system theme after the client mounts, so rendering dark
// (data-theme unset) until then avoids a hydration mismatch and matches the
// shell's current pre-fix behavior.
export function MomentsThemeShell({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dataTheme = mounted && resolvedTheme === "light" ? "light" : undefined;

  return (
    <main
      className="lifeos-cockpit moments-home"
      data-theme={dataTheme}
      data-testid="moments-home-shell"
    >
      {/* #553: `pb-32` (128px) reserves clearance for CaptureAffordance's
          footprint (see page.tsx's #477 comment) — the `calc(...)` term below
          keeps that clearance in step with the pill's own
          `env(safe-area-inset-bottom)` offset (CaptureAffordance.tsx), so a
          device with a home-indicator safe area doesn't lose the last row of
          content under the pill's now-taller reserved band. 0 on
          devices/browsers without a safe area, so this is a no-op there.

          This clearance is scoped to the scrolled-to-end position, same as
          #477 established (padding after the last child can't move
          earlier-in-flow content, like the side rail's Areas card, out from
          under the pill on an *unscrolled* view — only a bigger structural
          change, e.g. bounding this pane to its own internally-scrolled
          height, could do that, and that's a larger, riskier change than
          this fix's "smallest safe change" scope — see the #553 e2e guard's
          comment in tests/e2e/moments-home-parity.spec.ts for the tradeoff
          this leaves on the table). `min-h-dvh` (not `min-h-screen`)
          because `100vh` on mobile Safari is measured against the *largest*
          viewport (address bar hidden), which would under-reserve this
          padding once the toolbar is showing. */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[var(--max)] flex-col gap-5 px-4 pb-[calc(env(safe-area-inset-bottom)+8rem)] pt-4 sm:px-6 sm:pt-6">
        {children}
      </div>
    </main>
  );
}
