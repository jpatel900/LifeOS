"use client";

import Link from "next/link";
import { MoreHorizontal, Settings } from "lucide-react";
import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";
import { cn } from "@/lib/utils";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import { HIT_TARGET_MIN } from "./hitTarget";

/**
 * #574 — mobile shell: a compact bottom navigator, visible only below `sm`
 * (640px), so Start/Flow/Close, Capture, More, and Settings stay reachable
 * in the thumb zone. `TodayMoments.tsx` hides its header equivalents below
 * `sm`, so this is the only moment switch / Settings link rendered there.
 *
 * Renders the SAME MomentSwitcher the header uses (same value/onChange, no
 * forked state) — `idPrefix="bottom-nav"` only changes its testids, since
 * both breakpoint instances stay mounted (CSS-hidden, not unmounted).
 *
 * #1011: below 384px, MomentSwitcher's three text labels plus
 * Capture/More/Settings don't fit one row without a control's label escaping
 * its own box — this stacks into two rows there instead of shrinking a
 * label past legibility. `min-[384px]:` restores the single row.
 * MOBILE_NAV_CONTENT_HEIGHT_PX below is kept in sync with
 * MomentsThemeShell's reserved bottom padding at each width tier.
 */
export const MOBILE_NAV_CONTENT_HEIGHT_PX = 63; // single row, >=384px, measured live
export const MOBILE_NAV_CONTENT_HEIGHT_STACKED_PX = 111; // two rows, <384px, measured live

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
  /**
   * C2-S6 (#687), Criterion 3: the command palette's only triggers used to
   * be keyboard (`⌘K`/`Ctrl+K`) and `?palette=1` — no touch affordance
   * existed below `sm`, so Health/Areas were unreachable in ≤2 taps on a
   * phone (the palette is the documented mobile answer for them —
   * TodayMoments.tsx's own comment names it as such — but only on a device
   * with a keyboard). This is that trigger: extends the palette's existing
   * role rather than adding a parallel reach mechanism.
   */
  onOpenPalette(): void;
}

export function BottomNavigator({
  value,
  onChange,
  settingsHref = "/settings/areas",
  onCapture,
  captureDisabled = false,
  unsyncedCount = 0,
  onOpenPalette,
}: BottomNavigatorProps) {
  const pendingSync = unsyncedCount > 0;

  return (
    <nav
      aria-label="Moment and settings"
      // #1011: below 384px there is no single-row arrangement that fits the
      // switcher's three text labels plus Capture/More/Settings without a
      // control escaping its own box (measured live) — root's call: stack
      // into two rows there (`flex-col`) rather than shrink any label past
      // legibility. `min-[384px]:` restores the original single row.
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-1 border-t border-border bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden min-[384px]:flex-row min-[384px]:items-center min-[384px]:justify-between min-[384px]:gap-0.5"
      data-testid="bottom-navigator"
    >
      {/* `min-[384px]:contents` unwraps this row at 384px+, so its child
          becomes a direct flex item of `nav` again — byte-identical to the
          pre-two-row single-row layout. */}
      <div className="flex min-[384px]:contents">
        <MomentSwitcher
          value={value}
          onChange={onChange}
          idPrefix="bottom-nav"
        />
      </div>
      <div className="flex items-center justify-between gap-0.5 min-[384px]:contents">
        <button
          type="button"
          onClick={captureDisabled ? undefined : onCapture}
          disabled={captureDisabled}
          aria-disabled={captureDisabled}
          className={cn(
            HIT_TARGET_MIN,
            // #1011: `min-w-[44px]` (HIT_TARGET_MIN) overrides a flex item's
            // automatic content-based minimum width, so without `shrink-0`
            // this button could compress below its own label's render width
            // (measured live: 48.27px box vs 60.25px "Capture" text).
            "relative shrink-0 rounded-full bg-primary px-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:cursor-not-allowed disabled:opacity-70",
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
                {SAVED_ON_THIS_DEVICE_SHORT}
              </span>
            </span>
          ) : null}
        </button>
        {/* C2-S6 (#687): icon-only + sr-only-label, same pattern as
            Settings — no room for a fourth visible text label. "More" is the
            plain word for "everything else reachable from here". */}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="More"
          className={cn(
            HIT_TARGET_MIN,
            "rounded-full text-muted-foreground hover:text-foreground",
          )}
          data-testid="bottom-navigator-more"
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
          <span className="sr-only">More</span>
        </button>
        {/* #593: icon-only at mobile; the name survives for AT via
            aria-label/sr-only. */}
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
      </div>
    </nav>
  );
}
