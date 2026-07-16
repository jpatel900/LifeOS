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
import { HIT_TARGET_MIN } from "./hitTarget";
import { kbdHintClass } from "./kbdChip";

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
 *
 * D-10 R2 (#483 round 2): real focus-visible ring added (this is the ONLY
 * theme control in the entire app — no settings-page fallback exists — so
 * it must stay reachable and legibly focused on every viewport). Switched
 * from HIT_TARGET_ROW to HIT_TARGET_MIN: the kbd hint drops out of the
 * layout below `sm` (kbdChip.ts's HINT_REVEAL), leaving just the icon, and
 * without an explicit min-width floor that would shrink the button under
 * the 44px hit-target minimum on mobile.
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
        HIT_TARGET_MIN,
        // R3-C (#483 round 3): px-3 -> px-2.5 is part of the masthead's
        // Inter-reflow claw-back — see TodayMoments.tsx's header comment.
        "group gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1.5 text-sm font-semibold text-muted-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:duration-0",
      )}
      data-testid="masthead-theme-toggle"
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <MoonStar className="size-4" aria-hidden="true" />
      )}
      <kbd className={kbdHintClass()}>{momentKeyLabel("toggle-theme")}</kbd>
    </button>
  );
}
