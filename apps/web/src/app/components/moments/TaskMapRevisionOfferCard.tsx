"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RevisionSignal } from "@/lib/taskmap/revision";
import { HIT_TARGET_INVISIBLE } from "./hitTarget";

/**
 * FR-031 slice F5 (#679) — the one-line map-revision offer.
 *
 * Render-only until tapped: this component holds no state, runs no effects
 * (a guard test asserts no `useEffect` and no fetch lives here), and never
 * calls the AI itself. The deterministic kernel already decided the offer
 * is warranted before this renders; tapping "Suggest an update" is the ONE
 * thing that spends an AI call, and it goes through the existing draft
 * pipeline via the parent's handler. "Not now" dismisses and suppresses
 * re-offers until the evidence changes. Calm coaching, never a nag.
 */
export interface TaskMapRevisionOfferCardProps {
  /** Kernel signals; the first detail is shown as the plain-language "why". */
  signals: RevisionSignal[];
  /** Present at Close, where the card names which task's map it means. */
  taskTitle?: string | null;
  onPropose(): void;
  onDismiss(): void;
}

export function TaskMapRevisionOfferCard({
  signals,
  taskTitle = null,
  onPropose,
  onDismiss,
}: TaskMapRevisionOfferCardProps) {
  const reason = signals[0]?.detail ?? "Work went differently than planned.";

  return (
    <div
      className="workflow-compact-item flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-dashed px-3 py-2"
      data-testid="taskmap-revision-offer"
    >
      <p className="m-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {taskTitle
            ? `The map for “${taskTitle}” may be out of date.`
            : "This map may be out of date."}
        </span>{" "}
        <span data-testid="taskmap-revision-offer-reason">{reason}</span> Want
        an updated map to review?
      </p>
      <span className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPropose}
          className="min-h-[44px] touch-manipulation"
          data-testid="taskmap-revision-offer-propose"
        >
          Suggest an update
        </Button>
        <button
          type="button"
          className={cn(
            HIT_TARGET_INVISIBLE,
            "text-xs font-medium text-muted-foreground underline-offset-2 hover:underline",
          )}
          onClick={onDismiss}
          data-testid="taskmap-revision-offer-dismiss"
        >
          Not now
        </button>
      </span>
    </div>
  );
}
