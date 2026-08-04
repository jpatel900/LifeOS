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
 * element — not a global window listener. This keeps the palette → capture
 * → sheet stacking order correct for free, since CaptureAffordance is
 * always rendered and capture can open on top of an open sheet; whichever
 * overlay currently owns focus is the one Escape closes.
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
