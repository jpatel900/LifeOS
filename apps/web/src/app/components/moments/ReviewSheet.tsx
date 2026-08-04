"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import {
  countNeedsDecision,
  dedupeSessionsForDisplay,
  hasPlanToCompare,
  needsDecisionHeadline,
  selectNeedsDecision,
} from "@/lib/workflow/reviewStatus";
import type { DayCloseRecord } from "@/lib/review/dayClose";
import { savedOnThisDeviceAndSendingBanner } from "@/lib/statusVocabulary";
import { Button } from "@/components/ui/button";
import { MomentSheet } from "./MomentSheet";
import { HIT_TARGET_MIN } from "./hitTarget";

/**
 * Final UX Loop C2-S3 (#687) — the Review surface, ported.
 *
 * ## Why a sheet, and not more of the Close moment
 *
 * The two are different scopes, and the code says so plainly:
 *
 * - `buildCloseVM` is **today**: `isSameCalendarDay(block.start_at, now)`
 *   throughout, and its carry-forward list is today's missed blocks only.
 * - `selectNeedsDecision` (the legacy `reviewQueue`) is **standing open
 *   work**: every `active` task, every `backlog` task, blocked tasks, failed
 *   sessions and missed blocks — no day filter anywhere.
 *
 * Folding a list that is routinely 3-30 items long into the closing ritual
 * would break Close's day-scoping and bury its one deliberate action under a
 * queue. That is the overload the plain-visibility doctrine forbids, and Close
 * is already carrying wins, weekly and monthly rollups, an optional check-in
 * and a map-revision offer.
 *
 * A sheet is where this belongs by the existing convention: `MomentSheet` is
 * the shell for demoted stage surfaces (`PipelineOverview.tsx`: "packet:
 * PipelineOverview + demoted-surface sheets"), reached from the Pipeline
 * rail's own stage node. The rail's **Review** node was, until this slice, a
 * dead affordance — `handleDrillPipeline` toasted "Opens with the full shell"
 * — which is FINDING 1's defect class on a different control.
 *
 * ## The day's close is not re-implemented here, it is shown here
 *
 * C1 already made "close the day" idempotent, verdict-bearing, and a single
 * path (`TodayMoments`' `handleCloseDay` -> `saveReview()` -> the provider's
 * guard -> the database's guard). This sheet holds **zero** close logic: it
 * takes `dayClose` and `onCloseDay` as props and renders C1's own
 * action-or-verdict slot. So the legacy "Save review" capability survives the
 * port without a second write path, a second idempotency rule, or a second
 * place for the two to disagree.
 *
 * ## Every write rides the path that already existed
 *
 * | Control | Action | Same one `LifeOSCockpit` uses |
 * | --- | --- | --- |
 * | Carry forward | `carryForwardTask` | `onCarryForward` |
 * | Put off | `deferTask` | `onDefer` |
 * | Drop | `dropTask` | `onDrop` |
 * | Approve change / Keep as is | `decideOverridePolicyProposal` | `onDecidePolicy` |
 * | Close the day | `TodayMoments`' `handleCloseDay` | the same callback |
 *
 * FINDING 6 cannot recur here by construction: carrying an item forward is a
 * decision about that item and changes nothing else on the screen. The legacy
 * screen's navigation is fixed separately, in `LifeOSCockpit`, because
 * `/review` stays live until S6.
 */

export interface ReviewSheetProps {
  open: boolean;
  onClose(): void;
  selectedAreaId: string | null;
  now: Date;
  /** C1's day-close record, or null when today is genuinely still open. */
  dayClose: DayCloseRecord | null;
  /** `TodayMoments`' single close path. This sheet never closes a day itself. */
  onCloseDay(): void;
  onToast?(message: string): void;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="moments-label">{children}</h3>;
}

const REASON_LABEL: Record<string, string> = {
  open: "on today's list",
  backlog: "put off for later",
  stuck: "got stuck",
  missed: "the day went past it",
  partial: "only partly done",
};

export function ReviewSheet({
  open,
  onClose,
  selectedAreaId,
  now,
  dayClose,
  onCloseDay,
  onToast,
}: ReviewSheetProps) {
  const {
    state,
    carryForwardTask,
    deferTask,
    dropTask,
    overridePolicyProposals,
    decideOverridePolicyProposal,
  } = useWorkflow();

  // The shipped derivation, not a second one — same reason PlanSheet uses it.
  // `dark` only picks card colors this surface does not read.
  const vm = useMemo(
    () => buildCockpitViewModel(state, selectedAreaId, true, { now }),
    [state, selectedAreaId, now],
  );

  // The count and the list are the same array, via the shared definition.
  // `vm.reviewQueue` is that array already; calling the selector here as well
  // would be a second derivation of a rule this campaign just finished
  // consolidating.
  const needsDecision = vm.reviewQueue;
  const needsDecisionCount = countNeedsDecision(needsDecision);

  const sessions = useMemo(
    () => dedupeSessionsForDisplay(vm.sessions).slice(0, 5),
    [vm.sessions],
  );

  return (
    <MomentSheet open={open} title="Review" onClose={onClose} width="wide">
      <div className="grid gap-6" data-testid="review-sheet">
        {/* The headline says what the list beneath it holds, and its number IS
            that list's length. FINDING 5 in both its halves — see
            `lib/workflow/reviewStatus.ts`. */}
        <h3 className="moments-card-title" data-testid="review-sheet-headline">
          {needsDecisionHeadline(needsDecisionCount)}
        </h3>

        <section className="grid gap-2">
          <SectionTitle>Needs a decision</SectionTitle>
          {needsDecisionCount === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="review-sheet-decisions-empty"
            >
              Nothing is waiting on a decision.
            </p>
          ) : (
            <ul className="grid gap-2" data-testid="review-sheet-decisions">
              {needsDecision.map((item) => (
                <li
                  key={`${item.reason}-${item.task.id}`}
                  className="workflow-compact-item moments-row grid gap-2 p-3"
                  data-testid={`review-sheet-decision-${item.task.id}`}
                >
                  <div>
                    <p className="text-sm font-semibold">{item.task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {REASON_LABEL[item.reason] ?? item.reason}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        carryForwardTask(item.task.id);
                        onToast?.("Carried forward");
                      }}
                      className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                      data-testid={`review-sheet-carry-forward-${item.task.id}`}
                    >
                      Carry forward
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        deferTask(item.task.id);
                        onToast?.("Put off for later");
                      }}
                      className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                      data-testid={`review-sheet-defer-${item.task.id}`}
                    >
                      Put off
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        dropTask(item.task.id);
                        onToast?.("Dropped");
                      }}
                      className={cn(
                        HIT_TARGET_MIN,
                        "touch-manipulation text-muted-foreground",
                      )}
                      data-testid={`review-sheet-drop-${item.task.id}`}
                    >
                      Drop
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-2">
          <SectionTitle>Planned vs actual</SectionTitle>
          {sessions.length ? (
            <ul className="grid gap-3" data-testid="review-sheet-sessions">
              {sessions.map((session) => {
                const actual = session.actual_minutes ?? 0;
                const comparable = hasPlanToCompare(session);
                const planned = session.planned_minutes ?? 0;
                return (
                  <li
                    key={session.id}
                    className="grid gap-1"
                    data-testid={`review-sheet-session-${session.id}`}
                  >
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span>{session.outcome ?? session.status}</span>
                      <span className="tabular-nums">
                        {comparable
                          ? `${actual}/${planned} min`
                          : `${actual} min`}
                      </span>
                    </div>
                    {comparable ? (
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min((actual / planned) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    ) : (
                      /* No plan existed for this one, so there is nothing to
                         compare it against and no bar is drawn. The legacy
                         screen drew a FULL bar here, against "/0m". */
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`review-sheet-session-noplan-${session.id}`}
                      >
                        Started without a planned length — nothing to compare.
                      </p>
                    )}
                    {session.notes ? (
                      <p
                        className="text-xs text-muted-foreground"
                        data-testid={`review-sheet-session-note-${session.id}`}
                      >
                        {session.notes}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              data-testid="review-sheet-sessions-empty"
            >
              Focus sessions will appear here.
            </p>
          )}
        </section>

        {vm.agingWaitingOn.length ? (
          <section className="grid gap-2" data-testid="review-sheet-aging">
            <SectionTitle>Waiting on someone else</SectionTitle>
            <ul className="grid gap-2">
              {vm.agingWaitingOn.map((item) => (
                <li
                  key={`waiting-${item.task.id}`}
                  className="workflow-compact-item moments-row grid gap-1 p-3"
                  data-testid={`review-sheet-aging-${item.task.id}`}
                >
                  <p className="text-sm font-semibold">{item.task.title}</p>
                  {/* The threshold is a default rule (`agingRules.ts`), not
                      something the user set — so the line reports the rule
                      rather than attributing it to them. */}
                  <p className="text-xs text-muted-foreground">
                    Waiting {Math.floor(item.ageDays)} day
                    {Math.floor(item.ageDays) === 1 ? "" : "s"} — past the{" "}
                    {item.thresholdDays}-day mark.
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {vm.openCommitments.length ? (
          <section
            className="grid gap-2"
            data-testid="review-sheet-commitments"
          >
            <SectionTitle>You said you would</SectionTitle>
            <ul className="grid gap-2">
              {vm.openCommitments.map((task) => (
                <li
                  key={`commitment-${task.id}`}
                  className="workflow-compact-item moments-row p-3"
                  data-testid={`review-sheet-commitment-${task.id}`}
                >
                  <p className="text-sm font-semibold">{task.title}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* S9 (#261) ported unchanged in meaning: propose -> approve. Approving
            RECORDS the decision; nothing changes automatically. The copy says
            so, because the write really is only a `suggestion_record`. */}
        {overridePolicyProposals.length ? (
          <section
            className="grid gap-2"
            data-testid="review-sheet-policy-proposals"
          >
            <SectionTitle>Patterns worth a decision</SectionTitle>
            <p className="text-xs text-muted-foreground">
              Patterns from your recent choices. Approving records your call —
              nothing changes automatically.
            </p>
            <ul className="grid gap-2">
              {overridePolicyProposals.map((candidate) => (
                <li
                  key={`${candidate.policyIdentifier}-${candidate.areaId ?? "all"}`}
                  className="workflow-compact-item moments-row grid gap-2 p-3"
                  data-testid={`review-sheet-policy-${candidate.policyIdentifier}`}
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {candidate.policyIdentifier}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You {candidate.latestOverrideType} it —{" "}
                      {candidate.evidence}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        decideOverridePolicyProposal(candidate, "accepted");
                        onToast?.("Your call is recorded");
                      }}
                      className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                      data-testid={`review-sheet-policy-approve-${candidate.policyIdentifier}`}
                    >
                      Approve change
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        decideOverridePolicyProposal(candidate, "declined");
                        onToast?.("Your call is recorded");
                      }}
                      className={cn(
                        HIT_TARGET_MIN,
                        "touch-manipulation text-muted-foreground",
                      )}
                      data-testid={`review-sheet-policy-keep-${candidate.policyIdentifier}`}
                    >
                      Keep as is
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* C1's action-or-verdict slot, rendered — not re-implemented. A close
            button without the verdict branch would reintroduce audit P0#4's
            defect (an action that can be pressed forever and changes nothing
            visible) on a brand new surface. */}
        <section className="grid gap-2 border-t border-border pt-4">
          <SectionTitle>The day itself</SectionTitle>
          {dayClose ? (
            <div className="grid gap-1" data-testid="review-sheet-verdict">
              <p className="flex items-center gap-2 text-sm font-[650]">
                <span aria-hidden className="text-emerald-500">
                  ✓
                </span>
                Today is closed.
              </p>
              <p
                className="text-xs text-muted-foreground"
                data-testid="review-sheet-verdict-destination"
              >
                {dayClose.savedToAccount
                  ? "Today's close is saved to your account."
                  : savedOnThisDeviceAndSendingBanner("Today's close")}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Closing saves today&apos;s counts as reviewed and carries
                forward anything still open. You close a day once.
              </p>
              <div>
                <Button
                  type="button"
                  onClick={onCloseDay}
                  className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                  data-testid="review-sheet-close-day"
                >
                  Close the day
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </MomentSheet>
  );
}
