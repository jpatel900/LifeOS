"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReturnFocus } from "./useReturnFocus";
import { useFocusTrap } from "./useFocusTrap";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 *
 * Generic right-side slide-over shell reused by TriageSheet/PlanSheet.
 *
 * P5 shipped this as a SUMMARY shell with a link-out to the legacy stage
 * route, because LifeOSCockpit's TriageView/PlanView were not importable
 * without editing that ~2000-line component. That is no longer the shape:
 * #703 moved the real triage actions in, and C2-S2 (#687) ported the whole
 * Plan surface in. Both sheets now hold the actual controls and call the same
 * `useWorkflow()` actions the stage views call — the cockpit views were never
 * imported, so the original obstacle was routed around rather than removed.
 *
 * Escape handling mirrors CaptureOverlay/CommandPalette: focus lands on the
 * dialog on open, and Escape is handled via onKeyDown on the focused
 * element — not a global window listener. Whichever overlay owns focus is
 * the one Escape closes, which is why `closeTopOverlay`
 * (`TodayMoments.tsx`) is a defensive fallback for the palette → capture →
 * sheet order rather than the live Escape path.
 *
 * This comment used to add that the arrangement keeps that stacking order
 * "correct for free, since CaptureAffordance is always rendered and capture
 * can open on top of an open sheet". That second half is wrong, and #912
 * (one URL renders one screen, however you arrived at it) probed it against
 * the dev server rather than by reading:
 *
 * - `CaptureAffordance` and `BottomNavigator`'s capture button are both
 *   `z-40`; every sheet is `z-50` with a full-viewport `absolute inset-0`
 *   scrim. On `/?sheet=triage`, `document.elementFromPoint` at the pill's
 *   own centre returns `moment-sheet-scrim` at 1280×800 and
 *   `moment-sheet-dialog` at 375×812. Clicking where capture LOOKS like it
 *   sits closes the sheet — it never opens capture.
 * - The "C" shortcut is gated off while a sheet is open
 *   (`topbarShortcutsEnabled` requires `!activeSheet`).
 *
 * So capture cannot be opened on top of a sheet by click or by key. The only
 * way to hold both at once is a URL naming both (`?sheet=X&capture=1`, which
 * `deepLink.ts` deliberately still composes) — and even then capture does
 * not stack on top. `CaptureOverlay` is `z-50` too, but renders BEFORE the
 * sheets in `TodayMoments`' tree, so equal z-index plus sibling order puts
 * the sheet in front: probed on `/?sheet=triage&capture=1`,
 * `elementFromPoint` at the capture dialog's own centre also returns
 * `moment-sheet-scrim`, both dialogs carry `aria-modal="true"`, focus lands
 * on `<body>`, and Escape closes neither. Closing the sheet is what makes
 * capture reachable again.
 *
 * Left standing on purpose. Sheets and CaptureOverlay are both modal dialogs
 * with their own focus trap, so raising the pill above `z-50` would not make
 * the old claim true — it would open a second live modal underneath this
 * one. The URL pair is `deepLink.ts`'s exemption to weigh, not this shell's.
 */

export interface MomentSheetProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  /**
   * C2-S2: the ported Plan surface carries an 11-row hour rail beside four
   * decision panels — at `max-w-md` that is a single 2,000px scroll on a
   * 1440px screen. `"wide"` gives it room for the two-column layout the
   * legacy Plan screen used; every existing caller keeps the original width
   * by omitting the prop.
   */
  width?: "default" | "wide";
}

export function MomentSheet({
  open,
  title,
  onClose,
  children,
  width = "default",
}: MomentSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // SP-1: capture the opener before the autofocus effect below moves focus
  // onto the dialog shell itself, and trap Tab within it while open.
  useReturnFocus(open);
  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => dialogRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      data-testid="moment-sheet"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
        onClick={onClose}
        data-testid="moment-sheet-scrim"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          "workflow-primary-card relative z-10 grid h-full w-full content-start gap-5 overflow-y-auto border-l border-border bg-card p-6 outline-none motion-reduce:transition-none motion-reduce:duration-0",
          width === "wide" ? "max-w-full sm:max-w-3xl" : "max-w-sm sm:max-w-md",
        )}
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
        data-testid="moment-sheet-dialog"
      >
        {/* #690 Part 1: panel header to the moments grammar — fixed
            surface-title tier (`.moments-card-title`, the same 1.5rem/620 tier
            every moments surface title uses) instead of the ad-hoc
            `text-base`, and a hairline bottom divider that stages the header
            (what this panel is) above its summary body — the same masthead
            hairline the settings audit (#673 S1) established. */}
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <h2 className="moments-card-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              HIT_TARGET_INVISIBLE,
              "text-sm font-semibold text-muted-foreground hover:text-foreground",
            )}
            data-testid="moment-sheet-close"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
