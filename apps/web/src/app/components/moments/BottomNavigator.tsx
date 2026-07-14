"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import { HIT_TARGET_MIN } from "./hitTarget";

/**
 * #574 (epic #555 item 6) — mobile shell: a compact bottom navigator, visible
 * only below the `sm` breakpoint (<640px), so the Start/Flow/Close moment
 * switch and Settings are reachable in the thumb zone without scrolling to
 * the header at the top of the viewport. The header's own MomentSwitcher +
 * Settings link (TodayMoments.tsx) are unchanged and keep working at every
 * width — this is an additional, mobile-only affordance, not a replacement.
 *
 * State: this component owns none. It renders the SAME MomentSwitcher
 * component the header uses, wired to the SAME `value`/`onChange` pair
 * (TodayMoments' `moment`/`setMoment`), passed straight through as props —
 * there is no forked/local moment state here, just a second view onto the
 * one source of truth. `idPrefix="bottom-nav"` only changes the rendered
 * `data-testid`s (see MomentSwitcher.tsx) so the two simultaneous DOM
 * instances (header + this bar) don't collide on existing
 * `getByTestId("moment-switcher-*")` queries.
 *
 * Height math (kept in sync with CaptureAffordance's mobile bottom offset
 * and MomentsThemeShell's reserved bottom padding — see the cross-reference
 * comments in both, and MOBILE_NAV_CONTENT_HEIGHT_PX below):
 *   pt-2 (8px)
 *   + MomentSwitcher row: 44px button floor (HIT_TARGET_ROW) + 2x0.35rem
 *     wrapper padding (`.workflow-shell__nav` in globals.css overrides the
 *     component's Tailwind `p-1` — 0.35rem = 5.6px/side) + 2x1px border
 *     = ~57.2px (the Settings link's HIT_TARGET_MIN 44px floor is shorter,
 *     so the switcher is the row's binding height)
 *   + pb 0.5rem (8px, before the safe-area-inset-bottom term composed into
 *     the same `pb-[calc(env(...)+0.5rem)]` declaration)
 *   = ~73.2px, rounded up to 74. Verified against the real rendered height
 *   by the #574 e2e overlap guard (tests/e2e/moments-home-parity.spec.ts) —
 *   a first cut of this constant assumed the Tailwind `p-1` and
 *   undercounted at 60px, which that guard caught as an actual 390x844
 *   pill/navigator intersection.
 */
export const MOBILE_NAV_CONTENT_HEIGHT_PX = 74;

export interface BottomNavigatorProps {
  value: MomentValue;
  onChange(value: MomentValue): void;
  settingsHref?: string;
}

export function BottomNavigator({
  value,
  onChange,
  settingsHref = "/settings/areas",
}: BottomNavigatorProps) {
  return (
    <nav
      aria-label="Moment and settings"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden"
      data-testid="bottom-navigator"
    >
      <MomentSwitcher value={value} onChange={onChange} idPrefix="bottom-nav" />
      <Link
        href={settingsHref}
        className={cn(
          HIT_TARGET_MIN,
          "rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
        )}
        data-testid="bottom-navigator-settings-link"
      >
        Settings
      </Link>
    </nav>
  );
}
