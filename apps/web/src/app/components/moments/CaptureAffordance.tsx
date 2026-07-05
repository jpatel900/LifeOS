"use client";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Fixed bottom-center capture pill. Always-available affordance mirroring
 * useMomentKeyboard's "c"/"C" mapping (UX-INV-2 single-key capture).
 */

export interface CaptureAffordanceProps {
  onOpen(): void;
}

export function CaptureAffordance({ onOpen }: CaptureAffordanceProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
      data-testid="capture-affordance"
    >
      Capture a thought
      <kbd className="rounded border border-primary-foreground/40 bg-black/10 px-1.5 py-0.5 text-[0.7rem] font-semibold">
        C
      </kbd>
    </button>
  );
}
