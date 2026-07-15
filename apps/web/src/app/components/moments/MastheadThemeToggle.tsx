"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonStar, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  matchesMomentKeyBinding,
  momentKeyBindingById,
  momentKeyLabel,
} from "@/lib/keys/keymap";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * D-10 (#483, masthead audit finding #3): the prototype masthead has a
 * theme toggle (moon glyph + "D" kbd hint); the live topbar had none — the
 * only way to change theme was Settings. Wired to the EXISTING next-themes
 * setup already driving `html.light`/`.dark` (`@/components/theme-provider`
 * via AppShell) and the moments shell's own `data-theme` mirror
 * (MomentsThemeShell.tsx) — no new theme store, no new persistence.
 *
 * Same mounted-guard idiom as the existing (currently unused elsewhere)
 * `@/components/theme-toggle.tsx` and `MomentsThemeShell.tsx`: next-themes
 * only knows the persisted/system theme after the client mounts, so the
 * button renders (and defaults to) the dark-icon state until then, avoiding
 * a hydration mismatch, and stays disabled until it can act truthfully.
 *
 * The "D" kbd hint is real: pressing it (when `shortcutEnabled`) toggles
 * the theme, mirroring the design prototype's `toggleTheme()`. Implemented
 * as this component's own guarded window listener (not routed through
 * `useMomentKeyboard`, which this packet doesn't own) — see keymap.ts's
 * "toggle-theme" binding for the collision-checked definition.
 */

export interface MastheadThemeToggleProps {
  /**
   * When false, the "D" shortcut is inert (still attached/detached, no-op)
   * — pass the same expression TodayMoments already computes for
   * `useMomentKeyboard`'s `enabled`, so this never fires behind a modal.
   */
  shortcutEnabled?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A"
  ) {
    return true;
  }
  return target.isContentEditable;
}

export function MastheadThemeToggle({
  shortcutEnabled = true,
}: MastheadThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme !== "light" : true;

  useEffect(() => {
    if (!shortcutEnabled || !mounted) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        !matchesMomentKeyBinding(event, momentKeyBindingById("toggle-theme"))
      ) {
        return;
      }
      event.preventDefault();
      setTheme(isDark ? "light" : "dark");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutEnabled, mounted, isDark, setTheme]);

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        HIT_TARGET_ROW,
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm font-semibold text-muted-foreground transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:duration-0",
      )}
      data-testid="masthead-theme-toggle"
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <MoonStar className="size-4" aria-hidden="true" />
      )}
      <kbd className="rounded border border-border/60 bg-black/5 px-1 text-[0.65rem] font-semibold text-muted-foreground">
        {momentKeyLabel("toggle-theme")}
      </kbd>
    </button>
  );
}
