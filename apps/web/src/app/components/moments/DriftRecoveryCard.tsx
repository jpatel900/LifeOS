"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Moments pass P4 — packet: DriftRecoveryCard.
 *
 * Amber-tinted recovery surface for `FlowVM.drift`. Never uses the
 * destructive/`--state-risk` family — drifting off a block is reframed as
 * recoverable, not a failure. UX-INV-3: this card is never a dead end, so
 * "Reclaim block" is always available; "Fresh start" only renders when the
 * caller wires an `onAbandon` handler.
 */

export interface DriftRecoveryCardProps {
  drift: { minutes: number; reason?: string };
  onReclaim(): void;
  onAbandon?(): void;
}

const REASON_COPY: Record<string, string> = {
  stuck: "You marked it stuck.",
  distracted: "You marked it distracted.",
  missed: "The block passed by.",
};

export function DriftRecoveryCard({
  drift,
  onReclaim,
  onAbandon,
}: DriftRecoveryCardProps) {
  const headline =
    drift.minutes > 0
      ? `You drifted for ~${drift.minutes} minutes.`
      : "This block got away from you.";

  const reasonLine = drift.reason ? REASON_COPY[drift.reason] : undefined;

  return (
    <Card
      className="workflow-flagship-card moments-card moments-card--emphasis relative overflow-hidden p-0"
      style={{ borderColor: "var(--state-warn)" }}
      data-testid="drift-recovery-card"
    >
      <CardContent className="grid gap-3 p-5 sm:p-6">
        <h2 className="workflow-surface-title moments-card-title tabular-nums">
          {headline}
        </h2>
        {reasonLine ? (
          <p className="text-sm text-muted-foreground">{reasonLine}</p>
        ) : null}
        <p className="workflow-surface-body text-sm text-muted-foreground">
          Happens to everyone. Reclaim what&apos;s left, or pick a fresh start.
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onReclaim}
            className="min-h-[44px] touch-manipulation gap-2"
            style={{
              background: "var(--state-warn)",
              color: "var(--primary-foreground)",
            }}
            data-testid="drift-recovery-reclaim"
          >
            Reclaim block
          </Button>
          {onAbandon ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onAbandon}
              className="min-h-[44px] touch-manipulation"
              data-testid="drift-recovery-abandon"
            >
              Fresh start
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
