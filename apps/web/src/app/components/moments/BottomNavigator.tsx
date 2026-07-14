"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
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
  /**
   * #593: the mobile capture action lives IN this band (one bottom-band
   * action model). Wired to the same open/disabled/queue state the desktop
   * CaptureAffordance pill uses; the pill itself is `hidden` below `sm`.
   */
  onCapture(): void;
  captureDisabled?: boolean;
  unsyncedCount?: number;
}

export function BottomNavigator({
  value,
  onChange,
  settingsHref = "/settings/areas",
  onCapture,
  captureDisabled = false,
  unsyncedCount = 0,
}: BottomNavigatorProps) {
  const pendingSync = unsyncedCount > 0;

  return (
    <nav
      aria-label="Moment and settings"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden"
      data-testid="bottom-navigator"
    >
      <MomentSwitcher value={value} onChange={onChange} idPrefix="bottom-nav" />
      <button
        type="button"
        onClick={captureDisabled ? undefined : onCapture}
        disabled={captureDisabled}
        aria-disabled={captureDisabled}
        className={cn(
          HIT_TARGET_MIN,
          "relative rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-70",
        )}
        data-testid="bottom-navigator-capture"
      >
        {captureDisabled ? "Resolving…" : "Capture"}
        {pendingSync ? (
          <span
            role="status"
            aria-live="polite"
            className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[0.7rem] font-semibold leading-none tabular-nums shadow-sm"
            style={{ color: "var(--state-watch)" }}
            data-testid="bottom-navigator-capture-badge"
          >
            <span aria-hidden="true">{unsyncedCount}</span>
            <span className="sr-only">
              {unsyncedCount} {unsyncedCount === 1 ? "capture" : "captures"}{" "}
              waiting to sync
            </span>
          </span>
        ) : null}
      </button>
      {/* #593: icon-only at mobile — the band now also carries Capture, and
          three text affordances don't fit 390px without crowding. 44px
          square target; the name survives for AT via aria-label/sr-only. */}
      <Link
        href={settingsHref}
        aria-label="Settings"
        className={cn(
          HIT_TARGET_MIN,
          "rounded-full text-muted-foreground hover:text-foreground",
        )}
        data-testid="bottom-navigator-settings-link"
      >
        <Settings aria-hidden="true" className="size-5" />
        <span className="sr-only">Settings</span>
      </Link>
    </nav>
  );
}
