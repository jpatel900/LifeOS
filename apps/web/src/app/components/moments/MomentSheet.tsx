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
 * Fallback surface decision (see PR body): LifeOSCockpit's TriageView and
 * PlanView are not importable without editing the hot file — both are
 * deeply embedded in the single ~2000-line component (local `useState`,
 * closures over sibling state, no exported sub-component boundary). Rather
 * than extract them (out of scope for this packet, and risky mid-flight
 * with six concurrent packets touching the same file), this shell hosts a
 * thin SUMMARY body plus a link-out to the real stage view.
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
}

export function MomentSheet({
  open,
  title,
  onClose,
  children,
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
        className="workflow-primary-card relative z-10 grid h-full w-full max-w-sm gap-4 overflow-y-auto border-l border-border bg-card p-5 outline-none motion-reduce:transition-none motion-reduce:duration-0 sm:max-w-md"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
        data-testid="moment-sheet-dialog"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              HIT_TARGET_INVISIBLE,
              "text-xs font-semibold text-muted-foreground hover:text-foreground",
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
