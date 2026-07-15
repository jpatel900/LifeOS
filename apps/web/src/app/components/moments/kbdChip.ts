import { cn } from "@/lib/utils";

/**
 * D-10 R2 (#483 round 2, masthead packet) — a single kbd-chip visual
 * language, replacing five ad hoc treatments that shipped in round 1
 * (MomentSwitcher's two states, AreaSelector, MastheadThemeToggle,
 * KeyboardLegend) across three different font sizes with inconsistent
 * borders/backgrounds — flagged by round-1 critics as "noticeable."
 *
 * Two contrast variants only, never a third: NEUTRAL for a chip sitting on
 * a bg-muted/40 pill or directly on the page background, ON_ACCENT for the
 * one chip that sits on MomentSwitcher's selected (bg-primary) tab and
 * needs contrast against a solid accent fill instead. Both reuse existing
 * tokens (border-border, text-muted-foreground, primary-foreground) — no
 * new globals.css entries.
 *
 * HINT_REVEAL layers on top for the PER-CONTROL hints (the ones stamped
 * onto MomentSwitcher/AreaSelector/MastheadThemeToggle): hidden entirely
 * below `sm` — a touch viewport has no physical keyboard, so a key hint
 * there is dead weight (round-1 critic: "one stamped with keyboard hints on
 * a device with no keyboard"; matches KeyboardLegend's own pre-existing
 * `sm:flex` cutoff a few files over) — and at `sm`+ shown only on
 * hover/focus of the parent control (which must carry `group` on its own
 * root) rather than permanently stamped on every control at once. This is a
 * static opacity swap with NO transition/duration added (motion-budget
 * constraint) — the reveal is instant, not animated.
 *
 * KeyboardLegend's own chips do NOT take HINT_REVEAL — that legend's whole
 * purpose is to be the one permanent, always-visible reference, and it
 * remains the discoverability backstop for every shortcut whether or not a
 * user has hovered the control that owns it.
 */
export const KBD_CHIP_NEUTRAL =
  "rounded border border-border/60 bg-black/5 px-1 py-0.5 text-[0.65rem] font-semibold leading-none text-muted-foreground";

export const KBD_CHIP_ON_ACCENT =
  "rounded border border-primary-foreground/40 bg-black/10 px-1 py-0.5 text-[0.65rem] font-semibold leading-none text-primary-foreground/90";

export const KBD_HINT_REVEAL =
  "hidden opacity-0 sm:inline-flex sm:items-center sm:group-hover:opacity-100 sm:group-focus-within:opacity-100";

/** Per-control hint chip: hidden on touch, hover/focus-revealed at `sm`+. */
export function kbdHintClass(onAccent = false): string {
  return cn(onAccent ? KBD_CHIP_ON_ACCENT : KBD_CHIP_NEUTRAL, KBD_HINT_REVEAL);
}
