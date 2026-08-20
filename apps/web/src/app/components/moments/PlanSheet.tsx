"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { stableWorkflowKey } from "@/lib/workflowContext/reducerCore";
import { selectTasksToPlace } from "@/lib/workflow/planStatus";
import { Button } from "@/components/ui/button";
import { GoogleCalendarApprovalBridge } from "../GoogleCalendarApprovalBridge";
// Reused, not re-derived: the same hour label, the same estimate fallback and
// the same proposal-length maths the legacy Plan screen uses, so the ported
// surface can never round or name a time differently from the one it replaces.
import { estimate, formatHour, proposalMinutes } from "../cockpit/shared";
import { formatClock } from "./formatTime";
import { MomentSheet } from "./MomentSheet";
import { ScheduleList } from "./ScheduleList";
import type { ScheduleBlockVM } from "./momentsViewModel";
import { HIT_TARGET_MIN, HIT_TARGET_ROW } from "./hitTarget";
import {
  buildPlanRail,
  firstOpenHour,
  hasFirstMove,
  planRailLabel,
  type PlanRailPlacement,
} from "./planRail";

/**
 * Final UX Loop C2-S2 (#687) — the Plan surface, ported.
 *
 * ## What this replaced
 *
 * Until this slice, `PlanSheet` was a thin schedule summary with an "Open full
 * view →" link to `/calendar`, because the real Plan screen's controls were
 * unreachable from the moments home. The C2-S1 capability inventory verified
 * every one of those controls against real writes, and the owner ratified the
 * port with every legacy-only capability preserved. So the summary is now the
 * whole surface: hour-rail placement, unplan, the do-today and backlog lists,
 * the first-move prompt, proposal draft / accept / move later / reject,
 * duration recalibration, and the Google approval gate.
 *
 * ## Every write rides the path that already existed
 *
 * Nothing here invents a second placement path. Each control calls the exact
 * `useWorkflow()` action `LifeOSCockpit` wires `PlanView` to, so the durable
 * journal (`place_time_block`, `unplan_calendar_block`,
 * `time_block_proposals`, `override_records`) is reached through the shipped
 * code, not a copy of it:
 *
 * | Control | Action | Same one `LifeOSCockpit` uses |
 * | --- | --- | --- |
 * | hour row -> place | `planTaskAtHour` | `onPlan` |
 * | hour row -> take off | `unplanTask` | `onUnplan` |
 * | Save first move | `updateTaskFirstTinyStep` | `onUpdateFirstTinyStep` |
 * | Move to today | `promoteBacklogTask` | `onPromote` |
 * | Draft block | `createLocalProposalForTask` | `onCreateProposal` |
 * | Accept | `acceptLocalProposal` | `onAcceptProposal` |
 * | Move later | `editLocalProposal` (+30m) | `onNudgeProposal` |
 * | Reject | `rejectLocalProposal` | `onRejectProposal` |
 * | Use {N}m / Keep {N}m | `decideDurationRecalibration` | `onDecideRecalibration` |
 * | Approve / Cancel Google event | `GoogleCalendarApprovalBridge`, mounted | the same component |
 *
 * The view model is `buildCockpitViewModel` for the same reason — the lists
 * (`today`, `planned`, `backlog`, `proposals`) are the shipped, tested
 * derivations, and reusing them is what makes "the two surfaces show the same
 * day" true by construction rather than by inspection.
 *
 * ## FINDING 1 lives in `planRail.ts`
 *
 * The row's words and the row's tap now come from one derived action, so
 * "Drop here" over a tap that does nothing cannot recur. See that module for
 * the reasoning, including why the first-move gate itself is an owner call.
 */

export interface PlanSheetProps {
  open: boolean;
  onClose(): void;
  selectedAreaId: string | null;
  blocks: ScheduleBlockVM[];
  timeDisplay: "countdown" | "clock";
  now: Date;
  onToast?(message: string): void;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="moments-label">{children}</h3>;
}

function FirstMoveCard({
  taskId,
  taskTitle,
  value,
  onChange,
  onSave,
  inputRef,
}: {
  taskId: string;
  taskTitle: string;
  value: string;
  onChange(value: string): void;
  onSave(): void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const inputId = `plan-sheet-first-move-${taskId}`;
  const canSave = value.trim().length > 0;

  return (
    <div
      className="workflow-compact-item moments-row grid gap-2 p-3"
      data-testid={`plan-sheet-first-move-card-${taskId}`}
    >
      <label htmlFor={inputId} className="grid gap-2 text-sm font-semibold">
        What is the under-a-minute move that starts “{taskTitle}”?
        <input
          id={inputId}
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Example: open the notes and write one bullet"
          className="min-h-11 rounded-[var(--surface-radius-sm)] border border-border bg-background px-3 outline-none focus:border-primary"
          data-testid={`plan-sheet-first-move-input-${taskId}`}
        />
      </label>
      <div>
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={onSave}
          className={cn(HIT_TARGET_MIN, "touch-manipulation")}
          data-testid={`plan-sheet-first-move-save-${taskId}`}
        >
          Save first move
        </Button>
      </div>
    </div>
  );
}

export function PlanSheet({
  open,
  onClose,
  selectedAreaId,
  blocks,
  timeDisplay,
  now,
  onToast,
}: PlanSheetProps) {
  const {
    state,
    planTaskAtHour,
    unplanTask,
    promoteBacklogTask,
    updateTaskFirstTinyStep,
    createLocalProposalForTask,
    acceptLocalProposal,
    rejectLocalProposal,
    editLocalProposal,
    recalibrationForProposal,
    appliedDurationForArea,
    decideDurationRecalibration,
  } = useWorkflow();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [firstMoveDrafts, setFirstMoveDrafts] = useState<
    Record<string, string>
  >({});
  const [showEmptyHours, setShowEmptyHours] = useState(false);
  // Recalibrations decided in this visit, so an answered card resolves rather
  // than re-asking — same session-scoped set LifeOSCockpit keeps.
  const [decidedRecalIds, setDecidedRecalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const firstMoveInputRef = useRef<HTMLInputElement>(null);

  // A closed sheet must not reopen onto a stale selection or a half-typed
  // first move — same discipline TriageSheet applies to its map offer.
  useEffect(() => {
    if (!open) {
      setSelectedTaskId(null);
      setShowEmptyHours(false);
    }
  }, [open]);

  // The shipped derivation, not a second one. `dark` only picks card colors
  // this surface does not read, so its value is irrelevant here.
  const vm = useMemo(
    () => buildCockpitViewModel(state, selectedAreaId, true, { now }),
    [state, selectedAreaId, now],
  );

  // NOT `vm.today` (every active task): the same `selectTasksToPlace` rule the
  // Pipeline rail's Plan badge counts with. The rail is visible behind this
  // sheet, so a badge reading 0 beside a row here is a contradiction one glance
  // catches — and it was reachable (KNOWN_ISSUES row 11). Pinned by
  // `lib/workflow/planStatus.test.ts`.
  const toPlace = useMemo(
    () => selectTasksToPlace(state, vm.activeArea.id, now),
    [state, vm.activeArea.id, now],
  );

  const onlyReadyTaskId = toPlace.length === 1 ? toPlace[0].id : null;
  const taskIdToPlace = selectedTaskId ?? onlyReadyTaskId;
  const taskToPlace = toPlace.find((task) => task.id === taskIdToPlace) ?? null;

  const placements: PlanRailPlacement[] = vm.planned;
  const rail = useMemo(
    () =>
      buildPlanRail({
        placements,
        proposalHours: vm.proposals.map((item) => item.hour),
        taskToPlace,
        candidateCount: toPlace.length,
      }),
    [placements, vm.proposals, taskToPlace, toPlace.length],
  );

  const collapsedCount = rail.filter(
    (row) => row.collapsible && !showEmptyHours,
  ).length;

  function saveFirstMove(taskId: string) {
    const value = firstMoveDrafts[taskId]?.trim();
    if (!value) return;
    updateTaskFirstTinyStep(taskId, value);
    setFirstMoveDrafts((current) => ({ ...current, [taskId]: "" }));
    onToast?.("First move saved");
  }

  // FINDING 1's recovery half: a row that cannot place takes the user to the
  // field that unblocks it, rather than swallowing the tap.
  function focusFirstMove(taskId: string) {
    setSelectedTaskId(taskId);
    requestAnimationFrame(() => firstMoveInputRef.current?.focus());
  }

  function draftBlock(taskId: string) {
    const task = state.tasks.find((item) => item.id === taskId);
    const baseMinutes =
      task?.estimated_minutes_high ?? task?.estimated_minutes_low ?? 45;
    const minutes =
      appliedDurationForArea(task?.area_id ?? null, baseMinutes) ?? baseMinutes;
    const start = new Date(now);
    start.setHours(firstOpenHour(placements), 0, 0, 0);
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    createLocalProposalForTask({
      taskId,
      proposedStart: start.toISOString(),
      proposedEnd: end.toISOString(),
      rationale: `Drafted a block for ${formatHour(start.getHours())}.`,
    });
    onToast?.("Block drafted");
  }

  function moveProposalLater(proposalId: string) {
    const proposal = state.timeBlockProposals.find(
      (item) => item.id === proposalId,
    );
    if (!proposal) return;
    const start = new Date(proposal.proposed_start);
    const end = new Date(proposal.proposed_end);
    start.setMinutes(start.getMinutes() + 30);
    end.setMinutes(end.getMinutes() + 30);
    editLocalProposal(proposalId, {
      proposed_start: start.toISOString(),
      proposed_end: end.toISOString(),
      rationale: `${proposal.rationale} Moved later.`,
    });
    onToast?.("Moved 30 minutes later");
  }

  return (
    <MomentSheet open={open} title="Plan" onClose={onClose} width="wide">
      <div
        className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"
        data-testid="plan-sheet"
      >
        {/* Hour rail. Second on small screens (the decision comes before the
            grid), first from `lg:` up where both fit side by side — the same
            order swap the legacy Plan screen made for the same reason. */}
        {/* Explicit ordering, not a two-column wrapper: on a phone the page
            reads pick -> place -> refine (To place, the rail, then drafts,
            backlog and Google), and from `lg:` up the rail moves into its own
            tall left column beside the four decision panels. A wrapper div
            around the panels would have pushed the rail below ALL of them on
            mobile — the surface's whole point, three scrolls down. */}
        <section className="order-2 grid content-start gap-3 lg:order-1 lg:col-start-1 lg:row-span-4 lg:row-start-1">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Today’s hours</SectionTitle>
            <span className="text-xs text-muted-foreground">8a–6p</span>
          </div>
          {/* What is being placed is said ONCE, here, instead of eleven times
              down the rail. The first draft repeated the task's title in every
              open row — eleven copies of the same sentence, each wrapping to
              two lines. The rows still carry the title in their aria-label, so
              a screen reader hears which task each hour would take without the
              eye having to read it over and over. */}
          {taskToPlace && hasFirstMove(taskToPlace) ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="plan-sheet-placing"
            >
              Placing{" "}
              <span className="font-semibold text-foreground">
                {taskToPlace.title}
              </span>
              . Pick an hour.
            </p>
          ) : null}
          <div className="grid gap-2">
            {rail.map((row) => {
              const collapsed = row.collapsible && !showEmptyHours;
              const label = planRailLabel(row.action);
              return (
                <button
                  key={row.hour}
                  type="button"
                  data-testid={`plan-sheet-hour-${row.hour}`}
                  // The visible row is short; the accessible name still says
                  // which task this hour would take.
                  aria-label={
                    row.action.kind === "place"
                      ? `${formatHour(row.hour)} — tap to put “${row.action.taskTitle}” here`
                      : `${formatHour(row.hour)} — ${label}`
                  }
                  onClick={() => {
                    switch (row.action.kind) {
                      case "unplan":
                        unplanTask(row.action.blockId);
                        onToast?.("Taken off the rail");
                        return;
                      case "place":
                        planTaskAtHour(row.action.taskId, row.hour);
                        setSelectedTaskId(null);
                        onToast?.("Put on the rail");
                        return;
                      case "needsFirstMove":
                        focusFirstMove(row.action.taskId);
                        return;
                      default:
                        return;
                    }
                  }}
                  className={cn(
                    HIT_TARGET_ROW,
                    "grid-cols-[52px_1fr] items-center gap-2 rounded-[var(--surface-radius-sm)] border p-3 text-left",
                    collapsed ? "hidden lg:grid" : "grid",
                    row.placement
                      ? "border-primary/60 bg-primary/10"
                      : row.action.kind === "place"
                        ? "border-primary/40 bg-card"
                        : "border-border bg-card",
                  )}
                >
                  <span className="text-sm text-muted-foreground">
                    {formatHour(row.hour)}
                  </span>
                  <span>
                    {row.placement ? (
                      <>
                        <span className="block text-sm font-semibold">
                          {row.placement.task.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {label}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {label}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {collapsedCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowEmptyHours(true)}
                className={cn(
                  HIT_TARGET_ROW,
                  "rounded-[var(--surface-radius-sm)] border border-dashed border-border p-3 text-left text-sm font-semibold text-muted-foreground lg:hidden",
                )}
                data-testid="plan-sheet-show-empty-hours"
              >
                Show {collapsedCount} open hour
                {collapsedCount === 1 ? "" : "s"}
              </button>
            ) : null}
          </div>

          {/* The schedule readout the thin sheet used to be — kept, because
              it is the only place the rail's blocks appear with real clock
              times rather than whole hours. */}
          <div className="grid gap-2">
            <SectionTitle>On the calendar</SectionTitle>
            <ScheduleList blocks={blocks} timeDisplay={timeDisplay} now={now} />
          </div>
        </section>

        <section className="order-1 grid gap-2 lg:order-2 lg:col-start-2 lg:row-start-1">
          <SectionTitle>To place</SectionTitle>
          {taskToPlace && !hasFirstMove(taskToPlace) ? (
            <FirstMoveCard
              taskId={taskToPlace.id}
              taskTitle={taskToPlace.title}
              value={firstMoveDrafts[taskToPlace.id] ?? ""}
              inputRef={firstMoveInputRef}
              onChange={(value) =>
                setFirstMoveDrafts((current) => ({
                  ...current,
                  [taskToPlace.id]: value,
                }))
              }
              onSave={() => saveFirstMove(taskToPlace.id)}
            />
          ) : null}
          {toPlace.length ? (
            <ul className="grid gap-2" data-testid="plan-sheet-to-place">
              {toPlace.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    aria-pressed={taskIdToPlace === task.id}
                    onClick={() =>
                      setSelectedTaskId(
                        selectedTaskId === task.id ? null : task.id,
                      )
                    }
                    className={cn(
                      HIT_TARGET_ROW,
                      "w-full rounded-[var(--surface-radius-sm)] border p-3 text-left",
                      taskIdToPlace === task.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card",
                    )}
                    data-testid={`plan-sheet-task-${task.id}`}
                  >
                    <span className="block text-sm font-semibold">
                      {task.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      about {estimate(task)} minutes
                      {hasFirstMove(task)
                        ? ""
                        : " · needs a first move before it can go on the rail"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              data-testid="plan-sheet-to-place-empty"
            >
              Nothing waiting to be placed.
            </p>
          )}
        </section>

        <section className="order-3 grid gap-2 lg:col-start-2 lg:row-start-2">
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Drafted blocks</SectionTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!taskToPlace || !hasFirstMove(taskToPlace)}
              onClick={() =>
                taskToPlace && hasFirstMove(taskToPlace)
                  ? draftBlock(taskToPlace.id)
                  : undefined
              }
              className={cn(HIT_TARGET_MIN, "touch-manipulation")}
              data-testid="plan-sheet-draft-block"
            >
              Draft a block
            </Button>
          </div>
          {vm.proposals.length ? (
            <ul className="grid gap-2" data-testid="plan-sheet-proposals">
              {vm.proposals.map(({ allDayContexts, proposal, task, hour }) => {
                const recal = recalibrationForProposal(
                  proposal.area_id,
                  estimate(task),
                );
                return (
                  <li
                    // #844 — the RENDERED identity, stable across the
                    // device -> account id swap: a drafted card keeps the key
                    // it was born under when the sync swaps its row id, so the
                    // buttons inside are reconciled in place instead of being
                    // destroyed under the user's finger mid-tap. Test ids stay
                    // on the CURRENT row id on purpose — the truth spec names
                    // cards by the id the account gave them.
                    key={stableWorkflowKey(
                      state.accountIdByLocalId.proposals,
                      proposal.id,
                    )}
                    className="workflow-compact-item moments-row grid gap-2 p-3"
                    data-testid={`plan-sheet-proposal-${proposal.id}`}
                  >
                    <p className="text-sm font-semibold">{task.title}</p>
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid={`plan-sheet-proposal-when-${proposal.id}`}
                    >
                      {/* The real clock time, not just the hour. The
                              legacy card printed `formatHour(hour)`, so
                              "Move later" — which shifts the draft by 30
                              minutes — changed nothing a reader could see.
                              `formatClock` is the same wall-clock formatter
                              the schedule rows use. */}
                      {formatClock(proposal.proposed_start)} ·{" "}
                      {proposalMinutes(proposal)} minutes
                      {/* The legacy card printed the raw status word
                          (`proposed` / `edited`). The fact it carried — that
                          this draft has been moved from where it started — is
                          kept; the internal word is not. `proposed` adds
                          nothing a reader of a card headed "Drafted blocks"
                          does not already know, so it says nothing. */}
                      {proposal.status === "edited" ? " · moved" : ""}
                    </p>
                    {allDayContexts.map((context) => (
                      <p
                        key={`${proposal.id}:${context.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        All day that day: {context.summary}
                      </p>
                    ))}
                    {task.first_tiny_step?.trim() ? (
                      <p className="text-xs text-muted-foreground">
                        First move: {task.first_tiny_step}
                      </p>
                    ) : (
                      <FirstMoveCard
                        taskId={task.id}
                        taskTitle={task.title}
                        value={firstMoveDrafts[task.id] ?? ""}
                        onChange={(value) =>
                          setFirstMoveDrafts((current) => ({
                            ...current,
                            [task.id]: value,
                          }))
                        }
                        onSave={() => saveFirstMove(task.id)}
                      />
                    )}
                    {recal && !decidedRecalIds.has(proposal.id) ? (
                      <div
                        className="rounded-[var(--surface-radius-sm)] border border-border p-2 text-xs"
                        data-testid={`plan-sheet-recalibration-${proposal.id}`}
                      >
                        <p className="font-semibold">{recal.label}</p>
                        <p className="mt-1 text-muted-foreground">
                          Based on {recal.recalibration.sampleCount} finished
                          focus sessions in this area.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(
                            [
                              ["accepted", `Use ${recal.adjustedMinutes}m`],
                              ["dismissed", `Keep ${recal.estimateMinutes}m`],
                            ] as const
                          ).map(([decision, label]) => (
                            <Button
                              key={decision}
                              type="button"
                              size="sm"
                              variant={
                                decision === "accepted" ? "default" : "ghost"
                              }
                              onClick={() => {
                                decideDurationRecalibration(
                                  {
                                    proposalId: proposal.id,
                                    proposedStart: proposal.proposed_start,
                                    areaId: proposal.area_id,
                                    recalibration: recal,
                                  },
                                  decision,
                                );
                                setDecidedRecalIds((current) =>
                                  new Set(current).add(proposal.id),
                                );
                              }}
                              className={cn(
                                HIT_TARGET_MIN,
                                "touch-manipulation",
                              )}
                              data-testid={`plan-sheet-recalibration-${decision}-${proposal.id}`}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!task.first_tiny_step?.trim()}
                        onClick={() => {
                          acceptLocalProposal(proposal.id);
                          onToast?.("Put on the rail");
                        }}
                        className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                        data-testid={`plan-sheet-proposal-accept-${proposal.id}`}
                      >
                        Put it on the rail
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => moveProposalLater(proposal.id)}
                        className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                        data-testid={`plan-sheet-proposal-later-${proposal.id}`}
                      >
                        Move later
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          rejectLocalProposal(proposal.id);
                          onToast?.("Draft dropped");
                        }}
                        className={cn(
                          HIT_TARGET_MIN,
                          "touch-manipulation text-muted-foreground",
                        )}
                        data-testid={`plan-sheet-proposal-reject-${proposal.id}`}
                      >
                        Drop it
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              data-testid="plan-sheet-proposals-empty"
            >
              {toPlace.length > 1
                ? "Pick something above, then draft a block for it."
                : "Draft a block to try a time before you commit to it."}
            </p>
          )}
        </section>

        <section className="order-4 grid gap-2 lg:col-start-2 lg:row-start-3">
          <SectionTitle>Put off for later</SectionTitle>
          {vm.backlog.length ? (
            <ul className="grid gap-2" data-testid="plan-sheet-backlog">
              {vm.backlog.map((task) => (
                <li
                  key={task.id}
                  className="workflow-compact-item moments-row grid gap-2 p-3"
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!hasFirstMove(task)}
                    onClick={() => {
                      promoteBacklogTask(task.id);
                      onToast?.("Moved to today");
                    }}
                    className={cn(
                      HIT_TARGET_MIN,
                      "touch-manipulation justify-start text-left",
                    )}
                    data-testid={`plan-sheet-promote-${task.id}`}
                  >
                    Move to today: {task.title}
                  </Button>
                  {hasFirstMove(task) ? null : (
                    <FirstMoveCard
                      taskId={task.id}
                      taskTitle={task.title}
                      value={firstMoveDrafts[task.id] ?? ""}
                      onChange={(value) =>
                        setFirstMoveDrafts((current) => ({
                          ...current,
                          [task.id]: value,
                        }))
                      }
                      onSave={() => saveFirstMove(task.id)}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              data-testid="plan-sheet-backlog-empty"
            >
              Nothing put off for later.
            </p>
          )}
        </section>

        <section className="order-5 grid gap-2 lg:col-start-2 lg:row-start-4">
          <SectionTitle>Google Calendar</SectionTitle>
          <p className="text-xs text-muted-foreground">
            The hours above are yours alone. Nothing reaches your Google
            Calendar until you approve it here, one block at a time.
          </p>
          <GoogleCalendarApprovalBridge
            proposals={vm.proposals}
            planned={vm.planned}
          />
        </section>
      </div>
    </MomentSheet>
  );
}
