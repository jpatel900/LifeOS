"use client";

import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WhileYouWereOutSummary } from "@/lib/reEntry/summary";
import type {
  ReEntryDeferralOutcome,
  ReEntryDeferralPlan,
} from "@/lib/reEntry/defer";
import { useReturnFocus } from "./useReturnFocus";
import { useFocusTrap } from "./useFocusTrap";

/**
 * FR-028 re-entry amnesty, packet F-G2c: the return ritual presentation.
 *
 * Zero-red binding constraint: this component renders no `--state-risk`, no
 * `destructive` button variant, and no guilt language ("overdue", "late",
 * "failed", "missed") anywhere in its visible copy — every deferral is
 * framed as something already handled ("moved to backlog for you"), never as
 * a fault. UX-INV-1: at most one visually-primary action across the whole
 * ritual (the recovery proposal's "Make this my first move").
 */

export interface RecoveryCandidate {
  taskId: string;
  title: string;
  why: string;
}

export interface ReEntryRitualProps {
  summary: WhileYouWereOutSummary;
  plan: ReEntryDeferralPlan;
  outcomes: ReEntryDeferralOutcome[];
  demoMode: boolean;
  recovery: RecoveryCandidate | null;
  onAcceptRecovery(taskId: string): void;
  onSwapRecovery(): void;
  onDismiss(): void;
}

function findOutcome(
  outcomes: ReEntryDeferralOutcome[],
  kind: ReEntryDeferralOutcome["kind"],
  subjectId: string,
): ReEntryDeferralOutcome | undefined {
  return outcomes.find(
    (outcome) => outcome.kind === kind && outcome.subjectId === subjectId,
  );
}

function blockUnplanLabel(
  unplan: ReEntryRitualProps["plan"]["blockUnplans"][number],
  summary: WhileYouWereOutSummary,
): string {
  const lapsed = summary.lapsedBlocks.find(
    (block) => block.blockId === unplan.blockId,
  );
  return `${lapsed?.taskTitle ?? "Block"} unscheduled`;
}

export function ReEntryRitual({
  summary,
  plan,
  outcomes,
  demoMode,
  recovery,
  onAcceptRecovery,
  onSwapRecovery,
  onDismiss,
}: ReEntryRitualProps) {
  const hasApprovals = plan.requiresApproval.length > 0;
  const containerRef = useRef<HTMLDivElement>(null);

  // SP-1: the ritual has no explicit "opener" — it appears in place of the
  // moments content on load rather than being summoned over it — so
  // return-focus has little to restore (it's a safe no-op when there was no
  // meaningful prior focus). The trap is the load-bearing half here: while
  // the ritual is mounted, Tab must stay inside it rather than escaping to
  // controls the ritual is deliberately standing in front of. Both hooks
  // treat "mounted" as "active" since this component only renders while the
  // ritual owns the screen (TodayMoments conditionally mounts/unmounts it).
  useReturnFocus(true);
  useFocusTrap(true, containerRef);

  return (
    <div
      ref={containerRef}
      className="grid gap-6"
      data-testid="re-entry-ritual"
    >
      <div className="grid gap-1">
        <h1 className="workflow-surface-title text-xl font-semibold tabular-nums">
          Welcome back — {summary.absenceDays} days away.
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&rsquo;s what happened while you were out. Nothing is lost.
        </p>
      </div>

      <ul
        className="flex flex-wrap items-center gap-2"
        data-testid="re-entry-ritual-counts"
      >
        <li
          className="rounded-full border border-border bg-card px-3 py-1 text-xs tabular-nums"
          style={{ color: "var(--state-watch)" }}
          data-testid="re-entry-ritual-count-lapsed"
        >
          {summary.counts.lapsedBlocks} moved to backlog for you
        </li>
        <li
          className="rounded-full border border-border bg-card px-3 py-1 text-xs tabular-nums text-muted-foreground"
          data-testid="re-entry-ritual-count-triage"
        >
          {summary.counts.pendingTriage} waiting for triage
        </li>
        <li
          className="rounded-full border border-border bg-card px-3 py-1 text-xs tabular-nums text-muted-foreground"
          data-testid="re-entry-ritual-count-active"
        >
          {summary.counts.activeTasks} open
        </li>
      </ul>

      <Card className="border-border">
        <CardContent className="grid gap-3 p-5">
          <p className="text-sm font-medium">What moved</p>
          {plan.taskDeferrals.length === 0 && plan.blockUnplans.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="re-entry-ritual-deferrals-empty"
            >
              Nothing needed to move.
            </p>
          ) : (
            <ul className="grid gap-2" data-testid="re-entry-ritual-deferrals">
              {plan.taskDeferrals.map((deferral) => {
                const outcome = findOutcome(
                  outcomes,
                  "task_to_backlog",
                  deferral.taskId,
                );
                return (
                  <li
                    key={`task-${deferral.taskId}`}
                    className="flex items-center justify-between gap-3 text-sm"
                    data-testid={`re-entry-ritual-deferral-task-${deferral.taskId}`}
                  >
                    <span>{deferral.taskTitle ?? "Task"} → backlog</span>
                    {demoMode ? (
                      <span className="text-xs text-muted-foreground">
                        not saved in demo mode
                      </span>
                    ) : outcome?.ok === false ? (
                      <span className="text-xs text-muted-foreground">
                        needs a hand
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="text-xs"
                        style={{ color: "var(--state-ok)" }}
                      >
                        ✓
                      </span>
                    )}
                  </li>
                );
              })}
              {plan.blockUnplans.map((unplan) => {
                const outcome = findOutcome(
                  outcomes,
                  "block_unplanned",
                  unplan.blockId,
                );
                return (
                  <li
                    key={`block-${unplan.blockId}`}
                    className="flex items-center justify-between gap-3 text-sm"
                    data-testid={`re-entry-ritual-deferral-block-${unplan.blockId}`}
                  >
                    <span>{blockUnplanLabel(unplan, summary)}</span>
                    {demoMode ? (
                      <span className="text-xs text-muted-foreground">
                        not saved in demo mode
                      </span>
                    ) : outcome?.ok === false ? (
                      <span className="text-xs text-muted-foreground">
                        needs a hand
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="text-xs"
                        style={{ color: "var(--state-ok)" }}
                      >
                        ✓
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {hasApprovals ? (
            <ul
              className="grid gap-1 border-t border-border pt-3"
              data-testid="re-entry-ritual-approvals"
            >
              {plan.requiresApproval.map((approval) => (
                <li
                  key={`approval-${approval.blockId}`}
                  className="text-xs text-muted-foreground"
                >
                  kept as-is — has a Google calendar link; decide in Review
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {summary.stalest ? (
        <p
          className="text-sm tabular-nums text-muted-foreground"
          data-testid="re-entry-ritual-stalest"
        >
          Oldest waiting: {summary.stalest.label} ({summary.stalest.ageDays}{" "}
          days)
        </p>
      ) : null}

      {recovery ? (
        <Card
          className="workflow-flagship-card border-l-4 p-0"
          style={{ borderLeftColor: "var(--acc)" }}
          data-testid="re-entry-ritual-recovery"
        >
          <CardContent className="grid gap-3 p-5">
            <p className="workflow-page-eyebrow m-0">Recovery proposal</p>
            <h2 className="workflow-surface-title text-lg font-semibold">
              {recovery.title}
            </h2>
            <p className="text-sm text-muted-foreground">{recovery.why}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="default"
                onClick={() => onAcceptRecovery(recovery.taskId)}
                className="min-h-[44px] touch-manipulation"
                data-testid="re-entry-ritual-recovery-accept"
              >
                Make this my first move
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSwapRecovery}
                className="min-h-[44px] touch-manipulation"
                data-testid="re-entry-ritual-recovery-swap"
              >
                Something else
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="min-h-[44px] touch-manipulation"
                data-testid="re-entry-ritual-recovery-not-now"
              >
                Not now
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={onDismiss}
          className="min-h-[44px] touch-manipulation"
          data-testid="re-entry-ritual-start-day"
        >
          Start my day
        </Button>
      </div>
    </div>
  );
}
