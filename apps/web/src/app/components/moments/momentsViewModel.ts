import type { WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockProject,
  Phase2MockTask,
} from "@/lib/types";
import {
  computeDailyFocusBudget,
  deriveFreeHoursFromBlocks,
  splitByFocusBudget,
} from "@/lib/focus/dailyFocusBudget";
import {
  buildWeeklyRollupDraft,
  composeMonthlyRollupDraft,
} from "@/lib/rollups/rollupDraft";
import type { RollupSummaryContent } from "@lifeos/schemas";

/**
 * Moments pass P1 — packet: structural moments (Start/Flow/Close cockpit).
 *
 * Pure selectors, no fetches/writes. Every builder here takes `state` plus
 * an injected `now: Date` and returns plain view-model data; no ambient
 * Date.now, no network, no dispatch. Rendering (packet P2) owns all
 * presentation; this module owns only "what is true right now" derivation
 * so it stays independently unit-testable and swappable once S5 scheduling
 * intelligence replaces the deterministic firstMove/drift placeholders
 * marked below.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

/**
 * S6 (#258) stale-project threshold: a local constant, not the S4
 * `agingRules.ts` waiting-on/commitment thresholds (that module is scoped to
 * those two task-level signals specifically) and not a `global_defaults`
 * read (no such reader exists for project staleness yet, and adding one is
 * out of scope for a read-synthesis slice). "Stale" mirrors the same
 * strict-greater-than-N-days idiom: a project exactly 7 days old is not yet
 * stale.
 */
const STALE_PROJECT_THRESHOLD_DAYS = 7;

const OPEN_TASK_STATUSES = new Set<Phase2MockTask["status"]>([
  "active",
  "backlog",
  "scheduled",
  "blocked",
]);

const CLOSED_WAITING_STATUSES = new Set<Phase2MockTask["status"]>([
  "done",
  "dropped",
  "archived",
]);

function isSameCalendarDay(isoA: string, dateB: Date): boolean {
  const a = new Date(isoA);
  return (
    a.getFullYear() === dateB.getFullYear() &&
    a.getMonth() === dateB.getMonth() &&
    a.getDate() === dateB.getDate()
  );
}

function minutesBetween(startIso: string, endIso: string): number {
  return Math.round(
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / MS_PER_MINUTE,
  );
}

function areaName(areas: Phase2MockArea[], areaId: string | null): string {
  if (!areaId) return "";
  return areas.find((area) => area.id === areaId)?.name ?? "";
}

export interface ScheduleBlockVM {
  id: string;
  title: string;
  meta: string;
  state: "done" | "now" | "upcoming" | "free";
  startAt: string;
  endAt: string | null;
}

export interface FirstMoveVM {
  title: string;
  why: string;
  areaLabel: string;
  estMinutes: number;
  taskId: string | null;
}

/**
 * A single ranked focus-list entry (S5, #257). Shares `FirstMoveVM`'s shape
 * deliberately: focus item 0 always *is* `firstMove` (see `buildFocusItems`
 * doc comment), so callers can treat the head of `focusItems` and
 * `StartVM.firstMove` as the same value without re-deriving anything.
 */
export type FocusItemVM = FirstMoveVM;

export interface WaitingVM {
  taskId: string;
  title: string;
  since: string | null;
  daysWaiting: number;
  status: "ok" | "watch" | "risk";
}

export interface AreaHealthVM {
  id: string;
  name: string;
  status: "ok" | "watch" | "risk" | "idle";
  note: string;
}

/**
 * S6 (#258): the single stalest active project, or null when no active
 * project exceeds `STALE_PROJECT_THRESHOLD_DAYS`. `ageDays` is floored, so
 * "hasn't moved in N days" always reads as a whole, truthful number.
 */
export interface StaleProjectVM {
  id: string;
  name: string;
  ageDays: number;
}

/**
 * S6 (#258): a surfaced-not-applied nudge for a block missed on the prior
 * calendar day. Never mutates on its own — the forward action routes to the
 * existing Close-moment carry-forward surface (FR-012 mechanics), it does
 * not call `carryForwardTask` from here.
 */
export interface RecoveryNudgeVM {
  blockTitle: string;
  taskId: string;
}

export interface StartVM {
  firstMove: FirstMoveVM | null;
  blocks: ScheduleBlockVM[];
  waitingOn: WaitingVM[];
  areas: AreaHealthVM[];
  counts: {
    pendingTriage: number;
    activeTasks: number;
    todayBlocks: number;
  };
  /**
   * S5 (#257) calendar-load-aware daily focus. `focusBudget` is today's
   * 3/2/1 focus-item count (see `lib/focus/dailyFocusBudget`).
   * `focusDegraded` is true when the free-hours signal was unavailable and
   * `focusBudget` fell back to the documented default. `focusItems` is the
   * top-of-list slice within budget (item 0 === `firstMove` whenever
   * `firstMove` is non-null); `deferredItems` is the over-budget tail,
   * preserved and rendered — never hidden.
   */
  focusBudget: number;
  focusDegraded: boolean;
  focusItems: FocusItemVM[];
  deferredItems: FocusItemVM[];
  /**
   * S6 (#258) daily-brief synthesis, pure over data earlier slices already
   * created — no new fetch, no new write. `staleProject` is the single
   * stalest active project (or null: no active project qualifies, or the
   * `projects`/`tasks` signal is empty — both read as "omit the line", not
   * an error). `recoveryNudge` is present only when yesterday had a missed
   * calendar block with a linked task (or null otherwise); it is a plain
   * surfaced suggestion, never auto-applied.
   */
  staleProject: StaleProjectVM | null;
  recoveryNudge: RecoveryNudgeVM | null;
  /**
   * D-2 (design alignment, #483): start-moment hero copy, porting
   * prototype-2's "Good morning, Jay." + subline. Both are pure derivations
   * — `greeting` from `now` (+ optional injected name, see `buildGreeting`),
   * `daySynthesis` from counts this same builder already computed
   * (`blocks`, `focusItems`, `focusBudget`, `deferredItems`). No AI prose,
   * no new fetch.
   */
  greeting: string;
  daySynthesis: string;
}

export interface FlowVM {
  currentBlock: {
    title: string;
    areaLabel: string;
    startAt: string;
    endAt: string | null;
  } | null;
  drift: { minutes: number; reason: string } | null;
}

// S8 (#260): a per-area weekly rollup draft composed from the last 7 days of
// review activity, surfaced at close for the user to approve/dismiss. `summary`
// is the exact shape that persists on approve.
export interface RollupDraftVM {
  areaId: string;
  areaLabel: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  summary: RollupSummaryContent;
}

// #486 (monthly rollup surface, S8 follow-up): one already-APPROVED weekly
// rollup, resolved to a workflow-scoped area label. This is the shape the
// monthly composer reads — persisted rows fetched via `listRollupSummaries`,
// not session-local drafts (a single Close session sees at most one weekly
// draft per area, so composing "a month" from session state alone would be a
// fabricated comparison; see `buildMonthlyRollupDrafts`).
export interface ApprovedWeeklyRollupInput {
  areaId: string;
  areaLabel: string;
  periodStart: string;
  summary: RollupSummaryContent;
}

// #486: a per-area monthly rollup draft composed from that area's approved
// weekly rollups falling within the current calendar month. `weeksComposed`
// is display-only provenance (how many weeks fed the draft); the `summary`
// shape is identical to the weekly draft's and persists unchanged via the
// existing `createRollupSummary` path with `period_type: "month"`.
export interface MonthlyRollupDraftVM {
  areaId: string;
  areaLabel: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  summary: RollupSummaryContent;
  weeksComposed: number;
}

// #486: one prior-month APPROVED rollup, resolved to a workflow-scoped area
// id, used only for the month-over-month readback comparison.
export interface PriorMonthRollupInput {
  areaId: string;
  periodStart: string;
  periodEnd: string;
  summary: RollupSummaryContent;
}

// #486: the month-over-month readback line for one area — rendered only when
// a matching prior-month row actually exists (never fabricated).
export interface MonthOverMonthReadbackVM {
  areaId: string;
  periodLabel: string;
  counts: Record<string, number>;
}

export interface CloseVM {
  completedToday: number;
  missedToday: number;
  carryForward: { taskId: string; title: string }[];
  tomorrowFirstMove: FirstMoveVM | null;
  // S7 (#259): candidate wins to harvest at close — tasks completed today,
  // surfaced for the user to confirm/edit/skip into the evidence log.
  winCandidates: { taskId: string; title: string; areaLabel: string }[];
  // S8 (#260): per-area weekly rollup drafts to approve/dismiss.
  rollupDrafts: RollupDraftVM[];
}

interface NowOption {
  now: Date;
}

interface StartVMOptions extends NowOption {
  selectedAreaId?: string | null;
  /**
   * S5 (#257) degraded-path hook: set true when the free-hours signal is
   * known to be unavailable (e.g. calendar sync/connection down). Today
   * `deriveFreeHoursFromBlocks` reads only local `state.calendarBlocks`,
   * which is never itself "unavailable" (an empty list just means a fully
   * free day) — this flag is the explicit input that makes the degraded
   * focus-budget path reachable until a real free/busy read is plumbed
   * into the moments home, at which point its failure mode should set
   * this flag instead. Defaults to false (not degraded).
   */
  calendarUnavailable?: boolean;
  /**
   * D-2 (#483): optional display name for the hero greeting. LifeOS has no
   * user display-name field plumbed into `WorkflowContext` yet (single-user
   * app, no profile-table read) — this is an explicit injected input a
   * future caller can supply once one exists, not a new fetch added here.
   * Omitted/empty renders the time-of-day greeting alone rather than
   * fabricating a name. Defaults to `null`.
   */
  userName?: string | null;
}

function taskTitle(state: WorkflowState, taskId: string | null): string {
  if (!taskId) return "Focus block";
  return state.tasks.find((task) => task.id === taskId)?.title ?? "Focus block";
}

/** Time-derived subset of a calendar block, enough to place it on the timeline. */
export type TimelineBlockInput = Pick<
  Phase2MockCalendarBlock,
  "status" | "start_at" | "end_at"
>;

/**
 * D-5 (design alignment, #483) — pure done/now/upcoming derivation, extracted
 * from `buildTodayBlocks` so the row-state rule is independently unit
 * testable. A block is "done" once its status is `completed`; "now" while
 * `running` (status overrides the clock — an explicitly-started block stays
 * "now" even if the clock has drifted past its planned end) or while `now`
 * falls inside `[start_at, end_at)`; otherwise "upcoming". No `Date.now()` —
 * `now` is always caller-supplied, matching every other builder here.
 * "free" is deliberately not a return value: v0 has no gap-row synthesis
 * (see `buildTodayBlocks`'s doc comment), so no real block ever resolves to
 * it — `ScheduleBlockVM.state` keeps that union member for P2 rendering only.
 */
export function blockTimelineState(
  block: TimelineBlockInput,
  now: Date,
): "done" | "now" | "upcoming" {
  if (block.status === "completed") {
    return "done";
  }

  const startMs = new Date(block.start_at).getTime();
  const endMs = new Date(block.end_at).getTime();
  const nowMs = now.getTime();

  if (block.status === "running" || (startMs <= nowMs && nowMs < endMs)) {
    return "now";
  }

  return "upcoming";
}

/**
 * Today's non-cancelled calendar blocks mapped to schedule rows, sorted by
 * start time. "Today" = same calendar day as `now`. No gap/"free" row
 * synthesis in v0 (the `state` union member exists for P2 rendering only).
 */
function buildTodayBlocks(state: WorkflowState, now: Date): ScheduleBlockVM[] {
  return state.calendarBlocks
    .filter(
      (block) =>
        block.status !== "cancelled" && isSameCalendarDay(block.start_at, now),
    )
    .map(
      (block): ScheduleBlockVM => ({
        id: block.id,
        title: taskTitle(state, block.task_id),
        meta: areaName(state.areas, block.area_id),
        state: blockTimelineState(block, now),
        startAt: block.start_at,
        endAt: block.end_at,
      }),
    )
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

function findBlockByState(
  blocks: ScheduleBlockVM[],
  state: ScheduleBlockVM["state"],
): ScheduleBlockVM | null {
  return blocks.find((block) => block.state === state) ?? null;
}

function findRawBlock(
  state: WorkflowState,
  blockId: string,
): Phase2MockCalendarBlock | undefined {
  return state.calendarBlocks.find((block) => block.id === blockId);
}

/**
 * Active tasks scoped to `selectedAreaId` (falling back to all areas when
 * the scoped pool is empty), ordered oldest-first by `created_at`. This is
 * the existing priority ordering used by `deriveFirstMove`'s task fallback
 * and by the S5 focus-item list (#257) — both read from this single
 * ranking so "oldest active commitment" means the same thing everywhere.
 */
function orderedActiveTasks(
  state: WorkflowState,
  selectedAreaId?: string | null,
): Phase2MockTask[] {
  const scoped = selectedAreaId
    ? state.tasks.filter(
        (task) => task.status === "active" && task.area_id === selectedAreaId,
      )
    : [];

  const pool =
    scoped.length > 0
      ? scoped
      : state.tasks.filter((task) => task.status === "active");

  return [...pool].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

function oldestActiveTask(
  state: WorkflowState,
  selectedAreaId?: string | null,
): Phase2MockTask | null {
  return orderedActiveTasks(state, selectedAreaId)[0] ?? null;
}

/**
 * Deterministic pre-S5 firstMove precedence: now-block > upcoming-block >
 * oldest active task > null. Replace this derivation wholesale once S5
 * scheduling intelligence exists — the precedence order is a placeholder,
 * not a product commitment.
 */
function deriveFirstMove(
  state: WorkflowState,
  blocks: ScheduleBlockVM[],
  selectedAreaId?: string | null,
): FirstMoveVM | null {
  const nowBlock = findBlockByState(blocks, "now");
  if (nowBlock) {
    const raw = findRawBlock(state, nowBlock.id);
    return {
      title: nowBlock.title,
      why: "Scheduled now",
      areaLabel: nowBlock.meta,
      estMinutes: raw ? minutesBetween(raw.start_at, raw.end_at) : 25,
      taskId: raw?.task_id ?? null,
    };
  }

  const upcomingBlock = findBlockByState(blocks, "upcoming");
  if (upcomingBlock) {
    const raw = findRawBlock(state, upcomingBlock.id);
    return {
      title: upcomingBlock.title,
      why: "Next on your schedule",
      areaLabel: upcomingBlock.meta,
      estMinutes: raw ? minutesBetween(raw.start_at, raw.end_at) : 25,
      taskId: raw?.task_id ?? null,
    };
  }

  const oldest = oldestActiveTask(state, selectedAreaId);
  if (oldest) {
    return {
      title: oldest.title,
      why: "Oldest active commitment",
      areaLabel: areaName(state.areas, oldest.area_id),
      estMinutes: 25,
      taskId: oldest.id,
    };
  }

  return null;
}

function activeTaskToFocusItem(
  task: Phase2MockTask,
  areas: Phase2MockArea[],
): FocusItemVM {
  return {
    title: task.title,
    why: "Oldest active commitment",
    areaLabel: areaName(areas, task.area_id),
    estMinutes: 25,
    taskId: task.id,
  };
}

/**
 * Ranked focus-item list backing S5 (#257): item 0 is always `firstMove`
 * (converted to `FocusItemVM`, including the block-derived case where
 * `taskId` is null — a now/upcoming block with no linked task is still a
 * legitimate #1 focus item, it's just not a task). Items 1..N are the
 * remaining active tasks from `orderedActiveTasks` (oldest-first, the same
 * ranking `deriveFirstMove` already uses), skipping whichever task
 * `firstMove` already represents so it is never listed twice.
 *
 * This list is unbudgeted; callers apply `splitByFocusBudget` to get the
 * focus/deferred split.
 */
function buildFocusItems(
  state: WorkflowState,
  firstMove: FirstMoveVM | null,
  selectedAreaId?: string | null,
): FocusItemVM[] {
  const remainingTasks = orderedActiveTasks(state, selectedAreaId).filter(
    (task) => task.id !== firstMove?.taskId,
  );
  const remainingItems = remainingTasks.map((task) =>
    activeTaskToFocusItem(task, state.areas),
  );

  return firstMove ? [firstMove, ...remainingItems] : remainingItems;
}

/**
 * D-4 (design alignment, #483) waiting-on aging ramp: pure age (days) -> the
 * closed --state-* bucket (ok/watch/risk — never a new color axis, per
 * ADR 0004 §Decision R5 / G-UX-3). Extracted from the inline ternary this
 * builder always used, unchanged in behavior — same 3/7-day boundaries the
 * "waiting-on thresholds" tests already pin — so the SideRail row treatment
 * (color + a length-encoded age bar, porting prototype-2's `.wait .age`
 * shape) has one truthful, independently testable source for its bucket
 * instead of re-deriving it from raw days.
 */
export function waitingOnAgingBucket(daysWaiting: number): WaitingVM["status"] {
  if (daysWaiting >= 7) return "risk";
  if (daysWaiting >= 3) return "watch";
  return "ok";
}

function buildWaitingOn(state: WorkflowState, now: Date): WaitingVM[] {
  return state.tasks
    .filter(
      (task) =>
        Boolean(task.waiting_on_person_id) &&
        !CLOSED_WAITING_STATUSES.has(task.status),
    )
    .map((task): WaitingVM => {
      const since = task.waiting_on_since ?? null;
      const daysWaiting = since
        ? Math.floor((now.getTime() - new Date(since).getTime()) / MS_PER_DAY)
        : 0;

      return {
        taskId: task.id,
        title: task.title,
        since,
        daysWaiting,
        status: waitingOnAgingBucket(daysWaiting),
      };
    });
}

/**
 * Per-area health, precedence idle > risk > watch > ok (idle is checked
 * first because an area with zero open work has nothing to be at-risk
 * about, regardless of stale waiting entries left over from closed work).
 */
function buildAreaHealth(
  state: WorkflowState,
  now: Date,
  waitingOn: WaitingVM[],
): AreaHealthVM[] {
  return state.areas.map((area): AreaHealthVM => {
    const openTasks = state.tasks.filter(
      (task) => task.area_id === area.id && OPEN_TASK_STATUSES.has(task.status),
    );
    const todayBlocks = state.calendarBlocks.filter(
      (block) =>
        block.area_id === area.id &&
        block.status !== "cancelled" &&
        isSameCalendarDay(block.start_at, now),
    );
    const areaWaiting = waitingOn.filter((entry) => {
      const task = state.tasks.find((t) => t.id === entry.taskId);
      return task?.area_id === area.id;
    });
    const pendingTriage = state.captureItems.filter(
      (item) =>
        item.area_id === area.id &&
        (item.status === "new" || item.status === "triage_required"),
    );

    const noteParts = [`${openTasks.length} open`];
    if (areaWaiting.length > 0) noteParts.push(`${areaWaiting.length} waiting`);
    const note = noteParts.join(" · ");

    if (openTasks.length === 0 && todayBlocks.length === 0) {
      return { id: area.id, name: area.name, status: "idle", note };
    }

    if (areaWaiting.some((entry) => entry.status === "risk")) {
      return { id: area.id, name: area.name, status: "risk", note };
    }

    if (
      pendingTriage.length > 0 ||
      areaWaiting.some((entry) => entry.status === "watch")
    ) {
      return { id: area.id, name: area.name, status: "watch", note };
    }

    return { id: area.id, name: area.name, status: "ok", note };
  });
}

/**
 * Last-activity timestamp for one project (S6, #258): the newer of the
 * project's own `updated_at` and its linked tasks' `updated_at` (a task
 * moving is real project activity even when the project row itself wasn't
 * touched). Falls back to the project's `updated_at` alone when it has no
 * linked tasks.
 */
function projectLastActivity(
  project: Phase2MockProject,
  tasks: readonly Phase2MockTask[],
): number {
  let latest = new Date(project.updated_at).getTime();
  for (const task of tasks) {
    if (task.project_id !== project.id) continue;
    const taskUpdated = new Date(task.updated_at).getTime();
    if (taskUpdated > latest) latest = taskUpdated;
  }
  return latest;
}

/**
 * S6 (#258): the single stalest active project whose age strictly exceeds
 * `STALE_PROJECT_THRESHOLD_DAYS`, or null when none qualifies. Scoped to
 * `status === "active"` projects only — a paused/done/dropped/archived
 * project reading "hasn't moved" would be misleading, not informative.
 * Ties (identical age) break on `id` ascending for a deterministic pick.
 */
function deriveStaleProject(
  state: WorkflowState,
  now: Date,
): StaleProjectVM | null {
  const nowMs = now.getTime();

  const candidates = state.projects
    .filter((project) => project.status === "active")
    .map((project) => {
      const lastActivityMs = projectLastActivity(project, state.tasks);
      const ageDays = Math.floor((nowMs - lastActivityMs) / MS_PER_DAY);
      return { project, ageDays };
    })
    .filter(({ ageDays }) => ageDays > STALE_PROJECT_THRESHOLD_DAYS);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
    return a.project.id.localeCompare(b.project.id);
  });

  const stalest = candidates[0];
  return {
    id: stalest.project.id,
    name: stalest.project.title,
    ageDays: stalest.ageDays,
  };
}

/**
 * S6 (#258) FR-012-grounded recovery nudge: surfaces (never applies) a
 * missed block from the prior calendar day. Mirrors `buildCloseVM`'s
 * carry-forward filter — a missed block with no linked `task_id` is skipped,
 * same as there. Deterministic pick: earliest `start_at` among yesterday's
 * qualifying missed blocks. Returns null when yesterday had no missed block
 * with a task, which includes the common case of no prior-day data at all.
 */
function deriveRecoveryNudge(
  state: WorkflowState,
  now: Date,
): RecoveryNudgeVM | null {
  const yesterday = new Date(now.getTime() - MS_PER_DAY);

  const missedYesterday = state.calendarBlocks
    .filter(
      (block) =>
        block.status === "missed" &&
        block.task_id !== null &&
        isSameCalendarDay(block.start_at, yesterday),
    )
    .sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
    );

  const first = missedYesterday[0];
  if (!first || !first.task_id) return null;

  return {
    blockTitle: taskTitle(state, first.task_id),
    taskId: first.task_id,
  };
}

export type GreetingPeriod = "morning" | "afternoon" | "evening";

/**
 * D-2 (#483) time-of-day bucket for the hero greeting — local hour, same
 * `now.getHours()` idiom `TodayMoments`' `heuristicMoment` already uses so
 * "morning" here means the same thing it means for the start/flow/close
 * moment heuristic. Boundaries: morning [0,12), afternoon [12,17),
 * evening [17,24).
 */
export function greetingPeriod(now: Date): GreetingPeriod {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/**
 * D-2 (#483): deterministic hero greeting, porting prototype-2's
 * "Good morning, Jay." line. Pure over the injected `now` (no ambient
 * Date.now) plus an optional name — see `StartVMOptions.userName` for why
 * that input is optional and not read from a new source here. A
 * null/undefined/whitespace-only name renders the time-of-day greeting
 * alone; a real name renders "Good <period>, <name>."
 */
export function buildGreeting(now: Date, name?: string | null): string {
  const period = greetingPeriod(now);
  const trimmedName = name?.trim();
  const base = `Good ${period}`;
  return trimmedName ? `${base}, ${trimmedName}.` : `${base}.`;
}

export interface DaySynthesisInput {
  todayBlockCount: number;
  focusFilledCount: number;
  focusBudget: number;
  deferredCount: number;
}

/**
 * D-2 (#483): deterministic day-synthesis sentence, porting prototype-2's
 * subline ("One clear block ahead of the noon call. 3 hours of focus
 * available…"). Pure over counts `buildStartVM` already derives —
 * `blocks.length` (today's schedule), and the S5 (#257) focus-budget split
 * (`focusItems.length`/`focusBudget`/`deferredItems.length`). No AI prose,
 * no new signal: every number here already exists on `StartVM` before this
 * function runs.
 *
 * Rules (in order):
 * 1. Nothing scheduled AND nothing queued for focus -> a single truthful
 *    empty-day sentence pointing at capture (mirrors `StartMoment`'s
 *    existing UX-INV-6 empty-first-move copy).
 * 2. Otherwise, two clauses joined by an em dash: block count today
 *    ("No blocks…" / "1 block…" / "N blocks…"), then focus-slot fill
 *    ("nothing queued for focus" / "N of BUDGET focus slot(s) filled"),
 *    with a parenthetical "(N deferred)" suffix appended only when
 *    `deferredCount > 0` (never hidden — mirrors the FocusList's own
 *    never-hide-deferred rule).
 */
export function buildDaySynthesis(input: DaySynthesisInput): string {
  const { todayBlockCount, focusFilledCount, focusBudget, deferredCount } =
    input;

  if (todayBlockCount === 0 && focusFilledCount === 0 && deferredCount === 0) {
    return "Nothing on the calendar and nothing queued — capture something to get moving.";
  }

  const blocksPart =
    todayBlockCount === 0
      ? "No blocks on the calendar today"
      : `${todayBlockCount} block${todayBlockCount === 1 ? "" : "s"} on the calendar today`;

  const focusPart =
    focusFilledCount === 0
      ? "nothing queued for focus"
      : `${focusFilledCount} of ${focusBudget} focus slot${focusBudget === 1 ? "" : "s"} filled`;

  const deferredSuffix =
    deferredCount > 0 ? ` (${deferredCount} deferred)` : "";

  return `${blocksPart} — ${focusPart}${deferredSuffix}.`;
}

/** Start moment view model — today's schedule, first move, waiting-on, area health. */
export function buildStartVM(
  state: WorkflowState,
  options: StartVMOptions,
): StartVM {
  const {
    now,
    selectedAreaId = null,
    calendarUnavailable = false,
    userName = null,
  } = options;

  const blocks = buildTodayBlocks(state, now);
  const waitingOn = buildWaitingOn(state, now);
  const areas = buildAreaHealth(state, now, waitingOn);
  const firstMove = deriveFirstMove(state, blocks, selectedAreaId);

  const pendingTriage = state.captureItems.filter(
    (item) => item.status === "new" || item.status === "triage_required",
  ).length;
  const activeTasks = state.tasks.filter(
    (task) => task.status === "active",
  ).length;

  // S5 (#257): today's focus budget from free hours derived from today's
  // calendar blocks (see lib/focus/dailyFocusBudget for the documented
  // window/thresholds), degraded to the fixed default when the free-hours
  // signal is flagged unavailable via `calendarUnavailable`.
  const freeHours = calendarUnavailable
    ? null
    : deriveFreeHoursFromBlocks(state.calendarBlocks, now);
  const focusBudget = computeDailyFocusBudget({ freeHours });
  const focusDegraded = freeHours === null;
  const allFocusItems = buildFocusItems(state, firstMove, selectedAreaId);
  const { focus: focusItems, deferred: deferredItems } = splitByFocusBudget(
    allFocusItems,
    focusBudget,
  );

  // S6 (#258): daily-brief synthesis over data earlier slices already built —
  // no new fetch, no new write.
  const staleProject = deriveStaleProject(state, now);
  const recoveryNudge = deriveRecoveryNudge(state, now);

  // D-2 (#483) start-moment hero copy — pure over the values already
  // computed above; see `buildGreeting`/`buildDaySynthesis` doc comments.
  const greeting = buildGreeting(now, userName);
  const daySynthesis = buildDaySynthesis({
    todayBlockCount: blocks.length,
    focusFilledCount: focusItems.length,
    focusBudget,
    deferredCount: deferredItems.length,
  });

  return {
    firstMove,
    blocks,
    waitingOn,
    areas,
    counts: {
      pendingTriage,
      activeTasks,
      todayBlocks: blocks.length,
    },
    focusBudget,
    focusDegraded,
    focusItems,
    deferredItems,
    staleProject,
    recoveryNudge,
    greeting,
    daySynthesis,
  };
}

/**
 * Flow moment view model — the in-progress block and drift signal. Drift
 * has no minutes source in v0 (no drift-tracking data exists yet); `0` is
 * the truthful placeholder, not a real duration, whenever the most recent
 * execution session reports stuck/missed/distracted.
 */
export function buildFlowVM(state: WorkflowState, options: NowOption): FlowVM {
  const { now } = options;
  const blocks = buildTodayBlocks(state, now);
  const nowBlock = findBlockByState(blocks, "now");

  const currentBlock = nowBlock
    ? {
        title: nowBlock.title,
        areaLabel: nowBlock.meta,
        startAt: nowBlock.startAt,
        endAt: nowBlock.endAt,
      }
    : null;

  const latestSession = state.executionSessions[0];
  const driftReasons = new Set(["stuck", "missed", "distracted"]);
  const drift =
    latestSession && driftReasons.has(latestSession.status)
      ? { minutes: 0, reason: latestSession.status }
      : null;

  return { currentBlock, drift };
}

/**
 * Close moment view model — today's completed/missed counts, carry-forward
 * tasks, and tomorrow's first move. Carry-forward rule (kept deliberately
 * simple): active/scheduled tasks linked to at least one of today's missed
 * blocks, deduped by task id.
 */
export function buildCloseVM(
  state: WorkflowState,
  options: NowOption,
): CloseVM {
  const { now } = options;

  const todayBlocksRaw = state.calendarBlocks.filter(
    (block) =>
      block.status !== "cancelled" && isSameCalendarDay(block.start_at, now),
  );

  const completedToday = todayBlocksRaw.filter(
    (block) => block.status === "completed",
  ).length;
  const missedBlocks = todayBlocksRaw.filter(
    (block) => block.status === "missed",
  );
  const missedToday = missedBlocks.length;

  const carryForward: { taskId: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const block of missedBlocks) {
    if (!block.task_id || seen.has(block.task_id)) continue;
    const task = state.tasks.find((t) => t.id === block.task_id);
    if (!task) continue;
    if (task.status !== "active" && task.status !== "scheduled") continue;
    seen.add(block.task_id);
    carryForward.push({ taskId: task.id, title: task.title });
  }

  const tomorrowFirstMove = (() => {
    const oldest = oldestActiveTask(state, null);
    if (!oldest) return null;
    return {
      title: oldest.title,
      why: "Oldest active commitment",
      areaLabel: areaName(state.areas, oldest.area_id),
      estMinutes: 25,
      taskId: oldest.id,
    };
  })();

  const winCandidates: { taskId: string; title: string; areaLabel: string }[] =
    [];
  const winSeen = new Set<string>();
  for (const block of todayBlocksRaw) {
    if (block.status !== "completed" || !block.task_id) continue;
    if (winSeen.has(block.task_id)) continue;
    const task = state.tasks.find((t) => t.id === block.task_id);
    if (!task) continue;
    winSeen.add(block.task_id);
    winCandidates.push({
      taskId: task.id,
      title: task.title,
      areaLabel: areaName(state.areas, task.area_id),
    });
  }

  const rollupDrafts = buildWeeklyRollupDrafts(state, now);

  return {
    completedToday,
    missedToday,
    carryForward,
    tomorrowFirstMove,
    winCandidates,
    rollupDrafts,
  };
}

const ROLLUP_WEEK_DAYS = 7;

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * One weekly rollup draft per area that had completed/missed blocks in the last
 * 7 calendar days (ending on `now`). Pure derivation; the draft `summary` is the
 * exact shape persisted on approve. Sorted by area label for determinism.
 */
function buildWeeklyRollupDrafts(
  state: WorkflowState,
  now: Date,
): RollupDraftVM[] {
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (ROLLUP_WEEK_DAYS - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekStartMs = weekStart.getTime();
  const periodStart = toIsoDate(weekStart);
  const periodEnd = toIsoDate(now);

  interface AreaAgg {
    completedTitles: string[];
    missedTitles: string[];
    completedBlocks: number;
    missedBlocks: number;
  }
  const byArea = new Map<string, AreaAgg>();

  for (const block of state.calendarBlocks) {
    if (block.status !== "completed" && block.status !== "missed") continue;
    if (new Date(block.start_at).getTime() < weekStartMs) continue;

    const agg =
      byArea.get(block.area_id) ??
      ({
        completedTitles: [],
        missedTitles: [],
        completedBlocks: 0,
        missedBlocks: 0,
      } satisfies AreaAgg);

    const title = block.task_id
      ? state.tasks.find((task) => task.id === block.task_id)?.title
      : undefined;

    if (block.status === "completed") {
      agg.completedBlocks += 1;
      if (title) agg.completedTitles.push(title);
    } else {
      agg.missedBlocks += 1;
      if (title) agg.missedTitles.push(title);
    }
    byArea.set(block.area_id, agg);
  }

  const drafts: RollupDraftVM[] = [];
  for (const [areaId, agg] of byArea) {
    const summary: RollupSummaryContent = buildWeeklyRollupDraft({
      winTitles: agg.completedTitles,
      missedTitles: agg.missedTitles,
      counts: {
        wins: new Set(agg.completedTitles).size,
        completedSessions: agg.completedBlocks,
        missedSessions: agg.missedBlocks,
      },
    });
    drafts.push({
      areaId,
      areaLabel: areaName(state.areas, areaId),
      periodStart,
      periodEnd,
      periodLabel: `${periodStart} – ${periodEnd}`,
      summary,
    });
  }

  return drafts.sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
}

/**
 * #486 (S8 follow-up) — monthly rollup composition, mirroring
 * `buildWeeklyRollupDrafts`'s per-area/deterministic/testable shape but over
 * a caller-supplied input (not `state`): the current calendar month's already
 * APPROVED weekly rollups (resolved area labels, persisted `period_start`).
 * This stays a pure function — the fetch that produces `approvedWeeklyRollups`
 * lives in the caller (mirrors `userName`/`calendarUnavailable` on
 * `StartVMOptions`: an explicit injected input, not a new ambient read here).
 *
 * One draft per area that has 1+ approved weekly rollup whose `periodStart`
 * falls on/after the first day of `now`'s month. Composition itself reuses
 * `composeMonthlyRollupDraft` (S8, #260) unchanged — union highlights/misses,
 * sum counts. `periodStart` is the first of the month; `periodEnd` is `now`
 * (a month approved mid-month is a truthful partial period, same idiom as the
 * weekly draft's `periodEnd`).
 */
export function buildMonthlyRollupDrafts(
  approvedWeeklyRollups: ApprovedWeeklyRollupInput[],
  now: Date,
): MonthlyRollupDraftVM[] {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodStart = toIsoDate(monthStart);
  const periodEnd = toIsoDate(now);

  const byArea = new Map<string, ApprovedWeeklyRollupInput[]>();
  for (const rollup of approvedWeeklyRollups) {
    if (rollup.periodStart < periodStart) continue;
    const list = byArea.get(rollup.areaId) ?? [];
    list.push(rollup);
    byArea.set(rollup.areaId, list);
  }

  const drafts: MonthlyRollupDraftVM[] = [];
  for (const [areaId, rollups] of byArea) {
    const summary = composeMonthlyRollupDraft(rollups.map((r) => r.summary));
    if (!summary) continue;
    drafts.push({
      areaId,
      areaLabel: rollups[0].areaLabel,
      periodStart,
      periodEnd,
      periodLabel: `${periodStart} – ${periodEnd}`,
      summary,
      weeksComposed: rollups.length,
    });
  }

  return drafts.sort((a, b) => a.areaLabel.localeCompare(b.areaLabel));
}

/**
 * #486 — month-over-month readback: per area, the prior calendar month's
 * already-APPROVED monthly rollup, if one exists. Never fabricates a
 * comparison — an area with no prior-month row simply has no entry in the
 * returned list, and callers must treat absence as "nothing to show", not a
 * zero/empty placeholder.
 */
export function deriveMonthOverMonthReadback(
  priorMonthRollups: PriorMonthRollupInput[],
  now: Date,
): MonthOverMonthReadbackVM[] {
  const priorMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const priorMonthStart = toIsoDate(priorMonthDate);

  return priorMonthRollups
    .filter((rollup) => rollup.periodStart === priorMonthStart)
    .map((rollup) => ({
      areaId: rollup.areaId,
      periodLabel: `${rollup.periodStart} – ${rollup.periodEnd}`,
      counts: rollup.summary.counts,
    }));
}

/**
 * #486 — formats a truthful, deterministic month-over-month comparison line
 * from two count maps. Only keys present on `current` are shown (the current
 * month's own count keys are authoritative); a key absent from `prior`
 * compares against 0, not omitted, since "0 last month" is still true data
 * (not a fabrication — the prior row itself is only passed in when it
 * genuinely exists).
 */
export function formatRollupCountsComparison(
  current: Record<string, number>,
  prior: Record<string, number>,
): string {
  return Object.keys(current)
    .sort()
    .map((key) => {
      const currentValue = current[key];
      const priorValue = prior[key] ?? 0;
      const delta = currentValue - priorValue;
      const sign = delta > 0 ? "+" : "";
      const label = key.replace(/_/g, " ");
      return `${label}: ${currentValue} (${sign}${delta} vs last month)`;
    })
    .join(" · ");
}
