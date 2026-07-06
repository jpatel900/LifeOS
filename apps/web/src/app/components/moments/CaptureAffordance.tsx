"use client";

import { momentKeyLabel } from "@/lib/keys/keymap";
import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Fixed bottom-center capture pill. Always-available affordance mirroring
 * useMomentKeyboard's "c"/"C" mapping (UX-INV-2 single-key capture).
 */

export interface CaptureAffordanceProps {
  onOpen(): void;
  disabled?: boolean;
}

export function CaptureAffordance({
  onOpen,
  disabled = false,
}: CaptureAffordanceProps) {
  const captureLocked = disabled;

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
    </button>
  );
}
