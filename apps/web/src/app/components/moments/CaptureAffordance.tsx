"use client";

import { momentKeyLabel } from "@/lib/keys/keymap";
import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Fixed bottom-center capture pill. Always-available affordance mirroring
 * useMomentKeyboard's "c"/"C" mapping (UX-INV-2 single-key capture).
 *
 * G1 floor follow-up: when `unsyncedCount > 0`, a queue badge surfaces how many
 * offline-captured thoughts are still waiting to sync (the count exposed by
 * WorkflowContext after #443's offline queue). Color is never the only signal —
 * an sr-only phrase carries the same status without it.
 *
 * D-6 (#483): the full prototype microcopy ("Something on your mind? Capture
 * it — don't hold it.") only shows at `sm` and up, where the pill has room to
 * stay on one line. Below that it falls back to the original short label —
 * owner feedback on #483 (2026-07-10) was to keep density in check rather
 * than port clutter, and the longer sentence wrapping to extra lines on
 * narrow viewports would grow the pill's footprint past the clearance
 * `MomentsHomeShell`'s bottom padding reserves (see page.tsx) and risk
 * crowding the Pipeline row the #477 e2e guard checks. The shortcut hint and
 * all click/disabled behavior are unchanged.
 *
 * #553 (2026-07-13 owner-lens audit): two fixes.
 *
 * 1. `bottom-6` was a bare 24px offset with no `env(safe-area-inset-bottom)`
 *    term, so on a device with a home-indicator safe area the pill sat 24px
 *    above the *viewport* edge rather than 24px above the *safe* area —
 *    closer to on-screen gesture chrome than the design intends.
 *    `bottom-[calc(...)]` adds the env() term (0 on devices/browsers without
 *    one, so desktop and non-notched viewports are pixel-identical to the
 *    old `bottom-6`). See MomentsThemeShell.tsx for the matching
 *    bottom-padding term that keeps the shell's reserved clearance in sync.
 *
 * 2. `left-1/2 -translate-x-1/2` (the previous centering technique) was a
 *    real shrink-to-fit bug, not just a style preference: for a `fixed`
 *    element with `left` set and `right` left `auto`, the browser computes
 *    "available width" from `left` to the containing block's *far* edge —
 *    i.e. from the viewport's horizontal midpoint, not its actual right
 *    edge — before the `translate-x` recentering is ever applied (the
 *    transform doesn't feed back into that layout pass). At 390px that capped
 *    the pill's shrink-to-fit width at 195px regardless of its content's
 *    natural width, forcing the short "Capture a thought" label to wrap to
 *    two lines and inflating the pill to ~70px tall — 26px more of the
 *    Areas card row band than the label actually needed. `inset-x-0 mx-auto
 *    w-fit` centers the same way but gives shrink-to-fit the *full* viewport
 *    width to measure against, so the label renders on one line at its
 *    natural size (matching the `sm:` desktop pill, which never hit this
 *    bug because its wider two-line-microcopy content already exceeded
 *    195px and pushed past the cap visibly rather than wrapping tighter).
 *
 * #593 (audit #2): below `sm` the pill no longer renders AT ALL — the mobile
 * capture action moved into BottomNavigator's fixed band (one bottom-band
 * action model), because a mid-viewport floating pill inherently sits over
 * whatever content occupies its band at scroll positions other than the
 * true end (the #553/#574 offsets only ever managed that overlap, they
 * couldn't eliminate it). `hidden sm:flex` + the plain #553 24px offset
 * replace #574's breakpoint-split offset; the zero-intersection contract at
 * 375x667/390x844 (scroll 0 AND end) is proven by the #593 e2e guards in
 * tests/e2e/moments-home-parity.spec.ts. Desktop behavior is pixel-identical
 * to #553.
 */

export interface CaptureAffordanceProps {
  onOpen(): void;
  disabled?: boolean;
  unsyncedCount?: number;
}

export function CaptureAffordance({
  onOpen,
  disabled = false,
  unsyncedCount = 0,
}: CaptureAffordanceProps) {
  const captureLocked = disabled;
  const pendingSync = unsyncedCount > 0;

  return (
    <button
      type="button"
      onClick={captureLocked ? undefined : onOpen}
      disabled={captureLocked}
      aria-disabled={captureLocked}
      className={cn(
        HIT_TARGET_ROW,
        "fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] z-40 mx-auto hidden w-fit items-center gap-2 rounded-full border border-border bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:hover:scale-100 sm:flex",
      )}
      data-testid="capture-affordance"
    >
      {captureLocked ? (
        "Capture resolving…"
      ) : (
        <>
          <span className="hidden sm:inline">
            Something on your mind? <b className="font-bold">Capture it</b> —
            don&apos;t hold it.
          </span>
          <span className="sm:hidden">Capture a thought</span>
        </>
      )}
      <kbd className="rounded border border-primary-foreground/40 bg-black/10 px-1.5 py-0.5 text-[0.7rem] font-semibold">
        {momentKeyLabel("open-capture")}
      </kbd>
      {pendingSync ? (
        <span
          role="status"
          aria-live="polite"
          className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full border border-border bg-background px-1.5 py-0.5 text-[0.7rem] font-semibold leading-none tabular-nums shadow-sm"
          style={{ color: "var(--state-watch)" }}
          data-testid="capture-queue-badge"
        >
          <span aria-hidden="true">{unsyncedCount}</span>
          <span className="sr-only">
            {unsyncedCount} {unsyncedCount === 1 ? "capture" : "captures"}{" "}
            waiting to sync
          </span>
        </span>
      ) : null}
    </button>
  );
}
