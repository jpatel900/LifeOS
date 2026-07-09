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
        "fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:hover:scale-100",
      )}
      data-testid="capture-affordance"
    >
      {captureLocked ? "Capture resolving…" : "Capture a thought"}
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
