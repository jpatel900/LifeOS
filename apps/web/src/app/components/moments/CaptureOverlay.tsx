"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReturnFocus } from "./useReturnFocus";
import { useFocusTrap } from "./useFocusTrap";
import { CaptureCore, type CaptureCoreOutcome } from "./CaptureCore";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";
import type { CaptureParseState } from "@/lib/WorkflowContext";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 * #556: dialog chrome only now — the textarea/return-hook/save/containment
 * logic lives in the shared CaptureCore, reused across every capture
 * surface. This wrapper owns just the modal shell (scrim, dialog role,
 * focus trap, return-focus) and remounts CaptureCore fresh each time it
 * opens (it renders nothing while `open` is false), which is what gives
 * CaptureCore's own mount-time seeding/autofocus the correct "fresh per
 * capture session" behavior for free.
 *
 * SP-5: unsaved text must survive an accidental close/reopen within the
 * session. TodayMoments owns the sessionStorage read/write via
 * `initialText`/`onDraftChange`; this component never touches storage
 * directly.
 */

export interface CaptureOverlayProps {
  open: boolean;
  onSave(text: string, returnHook: string | null): void;
  onClose(): void;
  initialText?: string;
  onDraftChange?(text: string): void;
  onSaveRaw(text: string, returnHook: string | null): void;
  captureParse: CaptureParseState;
  onRetryWithMock(): void;
  onResolved?(outcome: CaptureCoreOutcome): void;
}

export function CaptureOverlay({
  open,
  onSave,
  onClose,
  initialText,
  onDraftChange,
  onSaveRaw,
  captureParse,
  onRetryWithMock,
  onResolved,
}: CaptureOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);

  // SP-1: capture the opener before any autofocus effect below moves focus
  // into the dialog, and trap Tab while open. Both hooks must be called
  // above the `if (!open) return null` so they see the same commit `open`
  // flips true on.
  useReturnFocus(open);
  useFocusTrap(open, dialogRef);

  if (!open) return null;

  // Containment: the scrim/Close only abandon the dialog while idle. Once a
  // parse is in flight (or its degraded/conclusion tail is showing), the
  // user is held in context — no early exit (FR-026).
  function handleCancel() {
    if (locked) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      data-testid="capture-overlay"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
        onClick={handleCancel}
        data-testid="capture-overlay-scrim"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Capture a thought"
        className="workflow-primary-card relative z-10 m-4 grid w-full max-w-lg gap-3 rounded-xl border border-border bg-card p-5 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
      >
        <CaptureCore
          mode="parse"
          testIdPrefix="capture-overlay"
          initialText={initialText}
          onDraftChange={onDraftChange}
          onSubmitParse={onSave}
          onSubmitRaw={onSaveRaw}
          captureParse={captureParse}
          onRetryWithMock={onRetryWithMock}
          onResolved={onResolved}
          onCancel={onClose}
          onLockChange={setLocked}
          hint="Enter to save · Shift+Enter for a new line · Esc to close"
        />

        <button
          type="button"
          onClick={handleCancel}
          disabled={locked}
          className={cn(
            HIT_TARGET_INVISIBLE,
            "justify-self-end text-xs font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
          data-testid="capture-overlay-close"
        >
          Close
        </button>
      </div>
    </div>
  );
}
