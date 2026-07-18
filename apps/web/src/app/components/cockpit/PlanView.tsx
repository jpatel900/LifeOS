import { useState } from "react";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import type { ProposalRecalibrationVM } from "@/lib/learning/learningSurface";
import { cn } from "@/lib/utils";
import { GoogleCalendarApprovalBridge } from "../GoogleCalendarApprovalBridge";
import { HIT_TARGET_MIN } from "../moments/hitTarget";
import { estimate, formatHour, Panel, proposalMinutes } from "./shared";

const HOURS = Array.from({ length: 11 }, (_, index) => index + 8);

function LaunchStepPrompt({
  taskId,
  value,
  onChange,
  onSave,
}: {
  taskId: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const inputId = `launch-step-${taskId}`;
  const canSave = value.trim().length > 0;

  return (
    // P2 (#660 surface audit): was a solid bg-[var(--amb-sf)] full-cell
    // fill — calm-accent discipline elsewhere is a soft color-mix tint over
    // the base row surface plus a border (see TodayView's T3 fix for the
    // same pattern), not a full-panel wash.
    <div
      className="rounded-2xl border p-3"
      style={{
        borderColor: "var(--amb-rng)",
        background: "color-mix(in oklch, var(--amb-fg) 12%, var(--sf2))",
      }}
    >
      <label
        htmlFor={inputId}
        className="grid gap-2 text-sm font-semibold text-[var(--amb-fg)]"
      >
        What is the under-a-minute physical move that starts this?
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Example: open the notes and write one bullet"
          className="min-h-11 rounded-[var(--surface-radius-sm)] border border-[var(--amb-rng)] bg-[var(--sf)] px-3 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
        />
      </label>
      <button
        type="button"
        disabled={!canSave}
        onClick={onSave}
        className={cn(
          HIT_TARGET_MIN,
          "mt-3 rounded-full px-4 text-sm font-bold",
          canSave
            ? "bg-[var(--acc)] text-[var(--on-acc)]"
            : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
        )}
      >
        Save first move
      </button>
    </div>
  );
}

// Plan stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2 —
// mechanical split, no behavior change).
export function PlanView({
  vm,
  selectedTaskId,
  onSelectTask,
  onPlan,
  onUnplan,
  onPromote,
  onAcceptProposal,
  onRejectProposal,
  onNudgeProposal,
  onCreateProposal,
  onUpdateFirstTinyStep,
  onExecute,
  onCapture,
  recalibrationForProposal,
  appliedDurationForArea,
  decidedRecalIds,
  onDecideRecalibration,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onPlan: (taskId: string, hour: number) => void;
  onUnplan: (blockId: string) => void;
  onPromote: (taskId: string) => void;
  onAcceptProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
  onNudgeProposal: (proposalId: string) => void;
  onCreateProposal: (taskId: string, hour: number) => void;
  onUpdateFirstTinyStep: (taskId: string, firstTinyStep: string) => void;
  onExecute: () => void;
  onCapture: () => void;
  recalibrationForProposal: (
    areaId: string | null,
    estimateMinutes: number,
  ) => ProposalRecalibrationVM | null;
  appliedDurationForArea: (
    areaId: string | null,
    estimateMinutes: number,
  ) => number | null;
  decidedRecalIds: Set<string>;
  onDecideRecalibration: (
    proposalId: string,
    input: {
      proposalId: string;
      proposedStart: string;
      areaId: string | null;
      recalibration: ProposalRecalibrationVM;
    },
    decision: "accepted" | "dismissed",
  ) => void;
}) {
  const onlyReadyTaskId = vm.today.length === 1 ? vm.today[0].id : null;
  const taskIdToPlace = selectedTaskId ?? onlyReadyTaskId;
  const taskToPlace =
    vm.today.find((task) => task.id === taskIdToPlace) ?? null;
  const [firstMoveDrafts, setFirstMoveDrafts] = useState<
    Record<string, string>
  >({});
  // #580: mobile task-first Plan — the "show empty hours" disclosure state.
  // Below `sm:` this starts collapsed; at `sm:` and up the CSS override
  // (`sm:grid` on every row) makes it irrelevant, matching the "desktop
  // unchanged" requirement without a media-query read.
  const [showEmptyHours, setShowEmptyHours] = useState(false);
  const missingLaunchStep =
    taskToPlace && !taskToPlace.first_tiny_step?.trim() ? taskToPlace : null;
  const hasReadyBlock = vm.planned.length > 0;
  const hasTaskToPlace = vm.today.length > 0;
  const firstOpenHour =
    HOURS.find((hour) => !vm.planned.some((item) => item.hour === hour)) ?? 9;
  function saveFirstMove(taskId: string) {
    const value = firstMoveDrafts[taskId]?.trim();
    if (!value) return;
    onUpdateFirstTinyStep(taskId, value);
    setFirstMoveDrafts((current) => ({ ...current, [taskId]: "" }));
  }

  // #580: below `sm:` the audit found ~11 empty hour cards standing between
  // the user and "To place" (a 2,040px empty scroll). Two changes, CSS-only
  // so desktop (>=sm) markup and behavior are byte-identical to before:
  // (1) `order-*` swaps visual order below `sm:` only — "To place" (the
  //     right column's first panel) leads, Hour rail follows; (2) hour rows
  //     with nothing to show (no placed block, no conflicting proposal) get
  //     `hidden sm:grid` so they collapse below `sm:` behind a "Show empty
  //     hours" disclosure, and are unconditionally visible at `sm:` and up.
  const hourHasConflict = (hour: number) =>
    vm.proposals.some(
      (item) => item.hour === hour && item.proposal.conflict_flag,
    );
  const collapsibleHours = HOURS.filter(
    (hour) =>
      !vm.planned.some((item) => item.hour === hour) && !hourHasConflict(hour),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel className="order-2 sm:order-1">
        <div className="mb-4 flex items-center justify-between">
          {/* P1 (#660 surface audit): text-2xl font-extrabold exceeded the
              700-weight cap; the size (1.5rem) already matched the
              card-title scale, so this pins onto that scale's tokens
              (workflow-surface-title moments-card-title) rather than the
              larger 2.25rem greeting scale — h1 stays the tag (one h1 per
              route, matching CaptureView's sr-only h1 and the
              routeSmoke.test.tsx "level: 1" guard). */}
          <h1 className="workflow-surface-title moments-card-title">
            Hour rail
          </h1>
          <span className="mono text-sm text-[var(--fnt)]">8a-6p</span>
        </div>
        <div className="grid gap-2">
          {HOURS.map((hour) => {
            const placed = vm.planned.find((item) => item.hour === hour);
            const collapsible =
              !placed && !hourHasConflict(hour) && !showEmptyHours;
            return (
              <button
                key={hour}
                type="button"
                data-testid={`hour-row-${hour}`}
                onClick={() =>
                  placed
                    ? onUnplan(placed.block.id)
                    : taskIdToPlace && !missingLaunchStep
                      ? onPlan(taskIdToPlace, hour)
                      : undefined
                }
                className={cn(
                  // P3 (#660 surface audit): rounded-2xl here now matches
                  // --surface-radius explicitly (token, not the bare
                  // utility) so the two-step 16/10px scale is legible from
                  // the class names alone, same as the rounded-xl ->
                  // --surface-radius-sm normalization below.
                  "min-h-16 grid-cols-[58px_1fr] items-center rounded-[var(--surface-radius)] border p-3 text-left",
                  collapsible ? "hidden sm:grid" : "grid",
                  placed
                    ? "border-[var(--acc-rng)] bg-[var(--acc-sf)]"
                    : taskIdToPlace
                      ? "border-[var(--acc-rng)] bg-[var(--sf2)]"
                      : "border-[var(--ln)] bg-[var(--sf2)]",
                )}
              >
                <span className="mono text-sm text-[var(--fnt)]">
                  {formatHour(hour)}
                </span>
                <span>
                  {placed ? (
                    <>
                      <span className="block font-bold">
                        {placed.task.title}
                      </span>
                      <span className="text-sm text-[var(--mut)]">
                        Tap to unplan
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--mut)]">
                      {taskIdToPlace
                        ? "Drop here"
                        : vm.today.length > 1
                          ? "Select a task first"
                          : "Open hour"}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {collapsibleHours.length && !showEmptyHours ? (
            <button
              type="button"
              data-testid="show-empty-hours-toggle"
              onClick={() => setShowEmptyHours(true)}
              className="min-h-11 rounded-2xl border border-dashed border-[var(--ln)] p-3 text-left text-sm font-semibold text-[var(--mut)] sm:hidden"
            >
              Show {collapsibleHours.length} empty hour
              {collapsibleHours.length === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
      </Panel>
      <div className="order-1 grid gap-5 sm:order-2">
        <Panel>
          {/* P1 (#660 surface audit): section-header grammar — the same
              .moments-label choice R2 made for ReviewView's Panel titles,
              applied consistently across every stage view this PR touches. */}
          <h2 className="moments-label">To place</h2>
          <div className="mt-4 grid gap-2">
            {missingLaunchStep ? (
              <LaunchStepPrompt
                taskId={missingLaunchStep.id}
                value={firstMoveDrafts[missingLaunchStep.id] ?? ""}
                onChange={(value) =>
                  setFirstMoveDrafts((current) => ({
                    ...current,
                    [missingLaunchStep.id]: value,
                  }))
                }
                onSave={() => saveFirstMove(missingLaunchStep.id)}
              />
            ) : null}
            {vm.today.length ? (
              vm.today.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    onSelectTask(selectedTaskId === task.id ? null : task.id)
                  }
                  className={cn(
                    "rounded-[var(--surface-radius)] border p-4 text-left",
                    selectedTaskId === task.id
                      ? "border-[var(--acc-rng)] bg-[var(--acc-sf)]"
                      : "border-[var(--ln)] bg-[var(--sf2)]",
                  )}
                >
                  <span className="block font-bold">{task.title}</span>
                  <span className="mono text-sm text-[var(--fnt)]">
                    {estimate(task)}m
                  </span>
                </button>
              ))
            ) : (
              <p className="text-[var(--mut)]">No do-today tasks waiting.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <h2 className="moments-label">Someday</h2>
          <div className="mt-4 grid gap-2">
            {vm.backlog.length ? (
              vm.backlog.map((task) => (
                // P2 (#660 surface audit): was a solid bg-[var(--blu-sf)]
                // full-cell fill; same tint+border treatment as
                // LaunchStepPrompt above.
                <div
                  key={task.id}
                  className="rounded-[var(--surface-radius)] border p-4 text-[var(--blu-fg)]"
                  style={{
                    borderColor: "var(--blu-rng)",
                    background:
                      "color-mix(in oklch, var(--blu-fg) 12%, var(--sf2))",
                  }}
                >
                  <button
                    type="button"
                    disabled={!task.first_tiny_step?.trim()}
                    onClick={() =>
                      task.first_tiny_step?.trim()
                        ? onPromote(task.id)
                        : undefined
                    }
                    className={cn(
                      HIT_TARGET_MIN,
                      "justify-start text-left font-semibold",
                      task.first_tiny_step?.trim()
                        ? "text-[var(--blu-fg)]"
                        : "cursor-not-allowed text-[var(--fnt)]",
                    )}
                  >
                    Move to today: {task.title}
                  </button>
                  {!task.first_tiny_step?.trim() ? (
                    <div className="mt-3">
                      <LaunchStepPrompt
                        taskId={task.id}
                        value={firstMoveDrafts[task.id] ?? ""}
                        onChange={(value) =>
                          setFirstMoveDrafts((current) => ({
                            ...current,
                            [task.id]: value,
                          }))
                        }
                        onSave={() => saveFirstMove(task.id)}
                      />
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-[var(--mut)]">Nothing deferred here.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="moments-label">Proposals</h2>
            <button
              type="button"
              disabled={!taskIdToPlace || Boolean(missingLaunchStep)}
              onClick={() =>
                taskIdToPlace &&
                !missingLaunchStep &&
                onCreateProposal(taskIdToPlace, firstOpenHour)
              }
              className={cn(
                HIT_TARGET_MIN,
                "rounded-full px-4 text-sm font-bold",
                taskIdToPlace && !missingLaunchStep
                  ? "bg-[var(--blu-sf)] text-[var(--blu-fg)]"
                  : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
              )}
            >
              Draft block
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {vm.proposals.length ? (
              vm.proposals.map(({ allDayContexts, proposal, task, hour }) => (
                <div
                  key={proposal.id}
                  className="rounded-[var(--surface-radius)] border border-[var(--ln)] bg-[var(--sf2)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{task.title}</p>
                      <p
                        data-testid="proposal-duration"
                        className="mono mt-1 text-sm text-[var(--fnt)]"
                      >
                        {formatHour(hour)} · {proposalMinutes(proposal)}m ·{" "}
                        {proposal.status}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!task.first_tiny_step?.trim()}
                        onClick={() =>
                          task.first_tiny_step?.trim()
                            ? onAcceptProposal(proposal.id)
                            : undefined
                        }
                        className={cn(
                          HIT_TARGET_MIN,
                          "rounded-full px-3 text-sm font-bold",
                          task.first_tiny_step?.trim()
                            ? "bg-[var(--acc)] text-[var(--on-acc)]"
                            : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
                        )}
                      >
                        Accept local
                      </button>
                    </div>
                  </div>
                  {/* #580: the "already has a scheduled block / accepting
                        adds another one" warning is gone — placement now
                        supersedes pending proposals atomically, so this state
                        is unreachable. */}
                  {/* E1 (issue 456): sourced duration recalibration from this
                        area's real actuals. Accepting APPLIES it — records the
                        decision (NS-INV-3), retimes this pending block to the
                        adjusted duration now, and stores a per-area profile so
                        future blocks in the area default to it (the card then
                        stops re-nagging). Keep keeps the original estimate. */}
                  {(() => {
                    const recal = recalibrationForProposal(
                      proposal.area_id,
                      estimate(task),
                    );
                    if (!recal || decidedRecalIds.has(proposal.id)) return null;
                    const decideInput = {
                      proposalId: proposal.id,
                      proposedStart: proposal.proposed_start,
                      areaId: proposal.area_id,
                      recalibration: recal,
                    };
                    return (
                      // P3 (#660 surface audit): rounded-xl (12px, off both
                      // scale steps) -> --surface-radius-sm (10px) — a
                      // nested panel one level in from the rounded-2xl
                      // proposal card above, matching moments-row's
                      // nested-surface radius.
                      <div
                        data-testid="proposal-recalibration"
                        className="mt-3 rounded-[var(--surface-radius-sm)] border border-[var(--ln)] bg-[var(--sf3)] px-3 py-2 text-sm"
                      >
                        <p className="font-semibold">{recal.label}</p>
                        <p className="mono mt-1 text-[var(--fnt)]">
                          Based on {recal.recalibration.sampleCount} completed
                          sessions in this area.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onDecideRecalibration(
                                proposal.id,
                                decideInput,
                                "accepted",
                              )
                            }
                            className={cn(
                              HIT_TARGET_MIN,
                              "rounded-full bg-[var(--acc)] px-3 text-sm font-bold text-[var(--on-acc)]",
                            )}
                          >
                            Use {recal.adjustedMinutes}m
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDecideRecalibration(
                                proposal.id,
                                decideInput,
                                "dismissed",
                              )
                            }
                            className={cn(
                              HIT_TARGET_MIN,
                              "rounded-full bg-[var(--sf3)] px-3 text-sm font-bold text-[var(--fnt)]",
                            )}
                          >
                            Keep {recal.estimateMinutes}m
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {task.first_tiny_step?.trim() ? (
                    <p className="mt-3 rounded-[var(--surface-radius-sm)] bg-[var(--acc-sf)] px-3 py-2 text-sm font-semibold text-[var(--acc2)]">
                      First move: {task.first_tiny_step}
                    </p>
                  ) : (
                    <div className="mt-3">
                      <LaunchStepPrompt
                        taskId={task.id}
                        value={firstMoveDrafts[task.id] ?? ""}
                        onChange={(value) =>
                          setFirstMoveDrafts((current) => ({
                            ...current,
                            [task.id]: value,
                          }))
                        }
                        onSave={() => saveFirstMove(task.id)}
                      />
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {allDayContexts.map((context) => (
                      <span
                        key={`${proposal.id}:${context.id}`}
                        className="rounded-full border border-[var(--ln2)] bg-[var(--sf3)] px-3 py-2 text-sm font-semibold text-[var(--mut)]"
                      >
                        All-day: {context.summary}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => onNudgeProposal(proposal.id)}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full bg-[var(--sf3)] px-3 text-sm font-semibold text-[var(--ink)]",
                      )}
                    >
                      Move later
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectProposal(proposal.id)}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full border border-[var(--ln2)] px-3 text-sm font-semibold text-[var(--mut)]",
                      )}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[var(--mut)]">
                {vm.today.length > 1
                  ? "Select a task first"
                  : "Select a task, then draft a local proposal."}
              </p>
            )}
          </div>
        </Panel>
        <Panel>
          <h2 className="moments-label">Calendar approval</h2>
          <details className="mt-3 text-[var(--mut)]">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Google writes are separate
            </summary>
            <p className="mt-3">
              This rail creates local blocks. External calendar writes still
              need explicit approval.
            </p>
          </details>
          <GoogleCalendarApprovalBridge
            proposals={vm.proposals}
            planned={vm.planned}
          />

          <button
            type="button"
            onClick={hasReadyBlock ? onExecute : onCapture}
            disabled={!hasReadyBlock && hasTaskToPlace}
            className={cn(
              "mt-5 min-h-12 w-full rounded-full font-bold",
              hasReadyBlock || !hasTaskToPlace
                ? "bg-[var(--btn)] text-[var(--btn-fg)]"
                : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
            )}
          >
            {hasReadyBlock
              ? "Start focusing"
              : hasTaskToPlace
                ? "Place a block first"
                : "Capture a thought"}
          </button>
        </Panel>
      </div>
    </div>
  );
}
