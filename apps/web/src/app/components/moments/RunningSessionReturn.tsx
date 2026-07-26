"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMmSs } from "./CurrentBlockHero";

/**
 * #737 C1 card 6: "navigation never ends a session; leaving shows a
 * persistent 'session running' affordance to return."
 *
 * Rendered on every moment EXCEPT Flow, for exactly as long as a session is
 * live. Calm on purpose — this is a way back, not an alarm: no red, no
 * countdown urgency colour, no modal. It borrows the moments card language
 * and the same `formatMmSs` clock the hero uses, so the number the user reads
 * here is the number they will see when they arrive.
 *
 * The copy says only what is true. It does not say "saved", because nothing
 * has been recorded — a running session has no outcome until the end sheet.
 */
export interface RunningSessionReturnProps {
  title: string;
  /** Seconds left on the session clock. */
  remaining: number;
  running: boolean;
  onReturn(): void;
}

export function RunningSessionReturn({
  title,
  remaining,
  running,
  onReturn,
}: RunningSessionReturnProps) {
  return (
    <Card
      className="moments-card border-l-4 p-0"
      style={{ borderLeftColor: "var(--acc)" }}
      data-testid="session-running-return"
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="grid gap-0.5">
          <p className="m-0 text-sm font-semibold">
            {running ? "Focus time is still running" : "Focus time is paused"}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {title} ·{" "}
            <span className="tabular-nums">{formatMmSs(remaining)}</span> left —
            nothing is written down until you say how it went.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onReturn}
          className="min-h-[44px] touch-manipulation"
          data-testid="session-running-return-action"
        >
          Back to it
        </Button>
      </CardContent>
    </Card>
  );
}
