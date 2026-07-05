"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Renders the single "first move" surfaced by momentsViewModel.deriveFirstMove.
 * UX-INV-1: exactly one visually-primary action per card ("Start now");
 * "Snooze 10m" and "Not this" are ghost/subordinate actions so the eye has
 * one obvious next step.
 */

export interface FirstMoveCardMove {
  title: string;
  why: string;
  areaLabel: string;
  estMinutes: number;
  followOn?: string;
}

export interface FirstMoveCardProps {
  move: FirstMoveCardMove;
  onStart(): void;
  onSnooze(): void;
  onSwap(): void;
}

export function FirstMoveCard({
  move,
  onStart,
  onSnooze,
  onSwap,
}: FirstMoveCardProps) {
  return (
    <Card
      className="workflow-flagship-card relative overflow-hidden border-l-4 p-0"
      style={{ borderLeftColor: "var(--acc)" }}
      data-testid="first-move-card"
    >
      <CardContent className="grid gap-3 p-5 sm:p-6">
        <p className="workflow-page-eyebrow m-0 tabular-nums">
          First move · {move.estMinutes} min · {move.areaLabel}
        </p>
        <h2 className="workflow-surface-title">{move.title}</h2>
        <p className="workflow-surface-body text-sm text-muted-foreground">
          {move.why}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            onClick={onStart}
            className="min-h-[44px] touch-manipulation gap-2"
            data-testid="first-move-start"
          >
            Start now
            <kbd className="rounded border border-border/60 bg-black/10 px-1.5 py-0.5 text-[0.7rem] font-semibold">
              ↵
            </kbd>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSnooze}
            className="min-h-[44px] touch-manipulation"
            data-testid="first-move-snooze"
          >
            Snooze 10m
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSwap}
            className="min-h-[44px] touch-manipulation"
            data-testid="first-move-swap"
          >
            Not this →
          </Button>
        </div>

        {move.followOn ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Then: {move.followOn}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
