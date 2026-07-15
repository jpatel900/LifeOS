"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FirstMoveCard, type FirstMoveCardMove } from "./FirstMoveCard";
import { ScheduleList } from "./ScheduleList";
import { SideRail } from "./SideRail";
import { PipelineOverview } from "./PipelineOverview";
import { FocusList } from "./FocusList";
import type { FirstMoveVM, StartVM } from "./momentsViewModel";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * The Start moment: first move, today's schedule, and the waiting-on/area
 * health side rail. Layout mirrors the P2 preview grid (main column + a
 * fixed-width rail). UX-INV-6: the empty state is truthful — no first move
 * queued is stated plainly, with the capture shortcut as the way out.
 *
 * Moments pass P5 added a collapsed-by-default "Pipeline" `<details>`
 * disclosure at the bottom (NFR-005): PipelineOverview rendered inside it,
 * never in the masthead and never a seventh nav item.
 *
 * D-3 (design alignment, #483) replaces that collapsed disclosure with the
 * prototype-2 stage rail, always visible (the prototype never collapses
 * it either) — still never in the masthead, still never a seventh nav
 * item. The disclosure's only interaction was expand/collapse, which
 * carried no deep-link or keyboard binding of its own (see TodayMoments'
 * deepLink handling — it targets moment/overlay/sheet, never this
 * section), so removing it drops nothing observable. The section keeps an
 * `aria-label`/sr-only heading so screen-reader users still get a "Pipeline"
 * landmark in place of the old `<summary>` text.
 *
 * S5 (#257) adds the calendar-load-aware focus budget: FirstMoveCard
 * remains the #1 focus item (it always renders `vm.firstMove`, which is
 * `vm.focusItems[0]` — see momentsViewModel's `buildFocusItems`); a
 * "Today's focus" FocusList renders the remaining in-budget items
 * (`vm.focusItems.slice(1)`) plus the over-budget `vm.deferredItems` tail,
 * visibly marked "Deferred" rather than hidden. `vm.focusDegraded` shows a
 * quiet note that a fixed default budget is in use, reusing the repo's
 * existing calm degraded-state phrasing (state the fallback plainly, keep
 * working — no guilt language).
 *
 * S6 (#258) daily brief additions — both purely additive, each independently
 * absent when its signal doesn't apply (no guilt language, no dead ends):
 * a one-line "hasn't moved in N days" note for `vm.staleProject` (omitted
 * entirely when null), and a `--state-watch` (never `--state-risk`)
 * recovery-nudge card for `vm.recoveryNudge` — a plain-language surfaced
 * suggestion for a block missed yesterday. The card's single action routes
 * to the existing Close-moment carry-forward surface (`onOpenRecovery`); it
 * never mutates from here.
 *
 * D-2 (design alignment, #483) — start-moment hero: a greeting
 * (`vm.greeting`) and deterministic day-synthesis sentence
 * (`vm.daySynthesis`), porting prototype-2's "Good morning, Jay." + subline
 * ahead of the FirstMoveCard. Both are computed in momentsViewModel
 * (`buildGreeting`/`buildDaySynthesis`) — pure, no AI prose, no new fetch.
 * Presentation-only: the first-move card below already carries the target
 * "Start now / Snooze 10m / Not this" microcopy and its existing
 * launch-gate handlers (`onStartMove`/`onSnooze`/`onSwap`) are unchanged.
 *
 * #551 (state truth, UX audit P0-1) — a capture is a real state change:
 * `vm.counts.pendingTriage > 0` now renders a clickable "N thought(s)
 * waiting for a decision." line (`onOpenTriage`) so the Start column stops
 * claiming "Nothing queued" right after the user just queued something.
 *
 * D-8 (design alignment, #483) — the hero (main/start) column must never
 * collapse to a bare text line. Three states, same card weight throughout
 * (`workflow-flagship-card moments-card moments-card--emphasis`, the exact
 * classes FirstMoveCard uses):
 *   1. `vm.firstMove` present -> FirstMoveCard, unchanged.
 *   2. No firstMove, `vm.topPendingTriageItem` present -> that item promoted
 *      into an accent "decide this next" card. Its single action is the
 *      existing `onOpenTriage` handler (opens the existing TriageSheet —
 *      see TodayMoments.tsx) — no new handler, no new navigation, no new
 *      copy implying the item is scheduled.
 *   3. Neither -> an accent empty-state card (same weight), calm
 *      capture-shortcut copy, no guilt/urgency language.
 * D-8 also hoists PipelineOverview from the bottom of the page to directly
 * under the hero, above the two-column grid, matching
 * docs/vision/prototypes/prototype-2-today-home.html's greeting -> pipe ->
 * grid order — it no longer sits in its own trailing section.
 *
 * D-8-POLISH (design alignment, #483) — the hero card and the schedule
 * label had accidental blank space, not deliberate whitespace. Root cause:
 * the two-column grid (`lg:grid-cols-[minmax(0,1fr)_20rem]`) defaults to
 * `align-items: stretch`, so whenever the SideRail column was taller than
 * the main column, the main column's nested `grid` divs were stretched to
 * match — and being `auto`-tracked grids themselves, that leftover height
 * bled into their own rows (padding out the hero card's bottom, and
 * widening the gap under "Today's schedule") rather than landing as a
 * single, intentional gap anywhere. Fix: `items-start` on both the
 * two-column grid and the main column's own `grid` wrapper, so every card
 * sizes to its own content — no fabricated height, no shrink-to-cramped.
 * Today's schedule is also now wrapped in the same `Card`/`moments-card`
 * treatment SideRail's "Waiting on"/"Areas" cards already use (previously
 * it was bare text with no boundary), so the bottom of the page reads as
 * two card-terminated columns instead of one column trailing into empty
 * canvas.
 */

export interface StartMomentProps {
  vm: StartVM;
  timeDisplay: "countdown" | "clock";
  now: Date;
  onStartMove(move: FirstMoveVM): void;
  onSnooze(): void;
  onSwap(): void;
  onOpenHealth(): void;
  pipelineCounts: Record<string, number>;
  onDrillPipeline(stage: string): void;
  onOpenRecovery(taskId: string): void;
  onOpenTriage(): void;
}

export function StartMoment({
  vm,
  timeDisplay,
  now,
  onStartMove,
  onSnooze,
  onSwap,
  onOpenHealth,
  pipelineCounts,
  onDrillPipeline,
  onOpenRecovery,
  onOpenTriage,
}: StartMomentProps) {
  const cardMove: FirstMoveCardMove | null = vm.firstMove
    ? {
        title: vm.firstMove.title,
        why: vm.firstMove.why,
        areaLabel: vm.firstMove.areaLabel,
        estMinutes: vm.firstMove.estMinutes,
      }
    : null;

  const recoveryNudge = vm.recoveryNudge;

  const pendingTriage = vm.counts.pendingTriage;
  const pendingTriageLine =
    pendingTriage > 0 ? (
      <button
        type="button"
        onClick={onOpenTriage}
        className="workflow-surface-body text-left text-sm text-muted-foreground underline-offset-4 hover:underline"
        data-testid="start-pending-triage"
      >
        {pendingTriage === 1
          ? "1 thought waiting for a decision."
          : `${pendingTriage} thoughts waiting for a decision.`}
      </button>
    ) : null;

  const topPendingTriageItem = vm.topPendingTriageItem;

  return (
    <div className="grid gap-6" data-testid="start-moment">
      <div className="grid gap-1" data-testid="start-hero">
        <h1 className="moments-greeting" data-testid="start-greeting">
          {vm.greeting}
        </h1>
        <p className="moments-daysynthesis" data-testid="start-day-synthesis">
          {vm.daySynthesis}
        </p>
      </div>

      <section
        aria-label="Pipeline"
        data-testid="start-moment-pipeline-rail"
        className="grid gap-2"
      >
        <h2 className="sr-only">Pipeline</h2>
        <PipelineOverview counts={pipelineCounts} onDrill={onDrillPipeline} />
      </section>

      <div
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"
        data-testid="start-moment-grid"
      >
        <div className="grid items-start gap-6" data-testid="start-moment-main-column">
          {cardMove && vm.firstMove ? (
            <>
              <FirstMoveCard
                move={cardMove}
                onStart={() => onStartMove(vm.firstMove as FirstMoveVM)}
                onSnooze={onSnooze}
                onSwap={onSwap}
              />
              {pendingTriageLine}
            </>
          ) : topPendingTriageItem ? (
            <Card
              className="workflow-flagship-card moments-card moments-card--emphasis relative overflow-hidden border-l-4 p-0"
              style={{ borderLeftColor: "var(--acc)" }}
              data-testid="start-pending-triage-card"
            >
              <CardContent className="grid gap-3 p-5 sm:p-6">
                <p className="workflow-page-eyebrow m-0 tabular-nums">
                  Decide this next
                  {topPendingTriageItem.areaLabel
                    ? ` · ${topPendingTriageItem.areaLabel}`
                    : ""}
                </p>
                <h2 className="workflow-surface-title moments-card-title">
                  {topPendingTriageItem.summary}
                </h2>
                <p className="workflow-surface-body text-sm text-muted-foreground">
                  {pendingTriage === 1
                    ? "1 thought waiting for a decision."
                    : `${pendingTriage} thoughts waiting for a decision.`}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="default"
                    onClick={onOpenTriage}
                    className="min-h-[44px] touch-manipulation gap-2"
                    data-testid="start-pending-triage-action"
                  >
                    Decide now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card
              className="workflow-flagship-card moments-card moments-card--emphasis relative overflow-hidden border-l-4 p-0"
              style={{ borderLeftColor: "var(--acc)" }}
              data-testid="start-moment-empty"
            >
              <CardContent className="grid gap-3 p-5 sm:p-6">
                <p className="workflow-page-eyebrow m-0">Nothing queued</p>
                <h2 className="workflow-surface-title moments-card-title">
                  Capture something to get moving
                </h2>
                <p className="workflow-surface-body text-sm text-muted-foreground">
                  Nothing queued — capture something with{" "}
                  <kbd className="rounded border border-border/60 bg-black/5 px-1 text-[0.7rem] font-semibold">
                    C
                  </kbd>
                  .
                </p>
              </CardContent>
            </Card>
          )}

          {vm.focusItems.length > 1 || vm.deferredItems.length > 0 ? (
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="moments-label text-sm font-semibold text-muted-foreground">
                  Today&apos;s focus
                </h2>
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  data-testid="focus-budget-label"
                >
                  Budget: {vm.focusBudget}
                </span>
              </div>
              {vm.focusDegraded ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="focus-degraded-note"
                >
                  Calendar load is unavailable right now, so a default focus
                  budget is in use.
                </p>
              ) : null}
              <FocusList
                items={vm.focusItems.slice(1)}
                deferred={vm.deferredItems}
              />
            </section>
          ) : null}

          {recoveryNudge ? (
            <Card
              className="workflow-support-card moments-card relative overflow-hidden border-l-4 p-0"
              style={{ borderLeftColor: "var(--state-watch)" }}
              data-testid="start-recovery-nudge"
            >
              <CardContent className="grid gap-2 p-4 sm:p-5">
                <p
                  className="workflow-page-eyebrow m-0"
                  style={{ color: "var(--state-watch)" }}
                >
                  Yesterday
                </p>
                <p className="text-sm">
                  A block got missed yesterday:{" "}
                  <span className="font-medium">
                    {recoveryNudge.blockTitle}
                  </span>
                  .
                </p>
                <div className="mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenRecovery(recoveryNudge.taskId)}
                    className="min-h-[44px] touch-manipulation"
                    data-testid="start-recovery-nudge-open"
                  >
                    Review it in Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {vm.staleProject ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="start-stale-project"
            >
              Hasn&apos;t moved in {vm.staleProject.ageDays} days:{" "}
              <span className="font-medium">{vm.staleProject.name}</span>
            </p>
          ) : null}

          <Card
            className="workflow-support-card moments-card"
            data-testid="start-schedule-card"
          >
            <CardContent className="grid gap-3 p-4 sm:p-5">
              <h2 className="moments-label text-sm font-semibold text-muted-foreground">
                Today&apos;s schedule
              </h2>
              <ScheduleList
                blocks={vm.blocks}
                timeDisplay={timeDisplay}
                now={now}
              />
            </CardContent>
          </Card>
        </div>

        <SideRail
          waitingOn={vm.waitingOn}
          areas={vm.areas}
          onOpenHealth={onOpenHealth}
        />
      </div>
    </div>
  );
}
