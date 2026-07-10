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
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--max)] flex-col gap-5 px-4 pb-32 pt-4 sm:px-6 sm:pt-6">
        {children}
      </div>
    </main>
  );
}
