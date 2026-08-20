import type { WorkflowState } from "@/lib/workflow";
import {
  buildWeeklyRollupDraft,
  composeMonthlyRollupDraft,
} from "@/lib/rollups/rollupDraft";
import type { RollupSummaryContent } from "@lifeos/schemas";
import { resolveDayClose, type DayCloseRecord } from "@/lib/review/dayClose";
import { isUuid } from "@/lib/workflowContext/reducerCore";
import {
  loggedWinTaskIdsOf,
  resolveLoggedWinsForDay,
  type LoggedWinRecord,
} from "@/lib/review/loggedWins";
import {
  areaName,
  isSameCalendarDay,
  oldestActiveTask,
  toIsoDate,
  type FirstMoveVM,
  type NowOption,
} from "./shared";

/**
 * Moments pass P1 — packet: Close moment view model.
 *
 * Pure selectors, no fetches/writes — same contract as `start.ts`/`flow.ts`.
 */

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
  //
  // #737 C1 re-score GAP 1: a task whose win is ALREADY logged today (on
  // either tier) is no longer a candidate. It used to be, on every mount, in
  // every tab — and taking the offer wrote a second record of one
  // accomplishment.
  winCandidates: { taskId: string; title: string; areaLabel: string }[];
  // #737 C1 re-score GAP 1: the wins this user has already logged for TODAY,
  // merged across the account and the device journal. The Close moment shows
  // these as the confirmed reading list and counts them in the verdict tail,
  // so both are facts read back rather than memories of this session.
  loggedWinsToday: LoggedWinVM[];
  // S8 (#260): per-area weekly rollup drafts to approve/dismiss.
  rollupDrafts: RollupDraftVM[];
  // Final UX Loop C1, Target Cards 1+7 (audit P0#4): the day's verdict, or
  // `null` when today is genuinely still open. Present means BOTH "render the
  // payoff" and "the action is spent" — the Close moment stops offering a
  // second close, because a second close is not a thing that exists.
  dayClose: DayCloseRecord | null;
}

/**
 * What the Close moment needs beyond `state` to answer "is today closed?".
 *
 * Injected rather than read here for the same reason `approvedWeeklyRollups`
 * is injected into the monthly composer: these are FETCHED tiers (the account
 * rows the provider loaded, and the device journal it read back), and this
 * module is a pure selector. Both default to empty, so a caller that has not
 * wired them yet simply sees an open day rather than a wrong verdict.
 */
export interface DayCloseOption {
  /** `period_start` of every daily review the ACCOUNT holds for this user. */
  accountClosedDays?: readonly string[];
  /** `period_start` of every daily review still waiting in the DEVICE journal. */
  journalledClosedDays?: readonly string[];
}

/** A logged win as the Close moment renders it (area label resolved). */
export interface LoggedWinVM {
  taskId: string;
  title: string;
  areaLabel: string;
}

/**
 * #737 C1 re-score, GAP 1 — the wins already logged, from both durable tiers.
 *
 * Injected for the same reason the two `*ClosedDays` lists are: they are
 * FETCHED tiers and this module is a pure selector. Both default to empty, so
 * a caller that has not wired them yet sees the pre-fix behaviour (every
 * completed task offered) rather than a wrong one.
 *
 * Two lists rather than one merged list, mirroring the day close, because the
 * tiers answer different questions: the account tier is what a SECOND MACHINE
 * sees, the journal tier is what THIS DEVICE holds but has not sent yet. Both
 * mean "the user already logged this", which is the only question the offer
 * needs answered — so unlike `resolveDayClose` there is no precedence to
 * resolve here, just a union.
 */
export interface LoggedWinsOption {
  /** Today's `win_records` rows the ACCOUNT holds for this user. */
  accountLoggedWins?: readonly LoggedWinRecord[];
  /** Wins still waiting in the DEVICE journal, not yet in the account. */
  journalledLoggedWins?: readonly LoggedWinRecord[];
}

/**
 * #737 C1 re-score GAP 4 — the DEVICE tier of "which blockless sessions did
 * the user finish today?".
 *
 * Injected for the same reason the two `*ClosedDays` lists and the two logged-
 * win lists are: it is a FETCHED tier (a read of the pending-writes journal)
 * and this module is a pure selector. Defaults to empty, so a caller that has
 * not wired it yet sees the account tier alone rather than a wrong number.
 *
 * A list of LOCAL calendar days (one entry per queued write), not a count, so
 * the view model applies its own "is this today?" test with the same day
 * derivation everything else here uses.
 */
export interface CompletedSessionsOption {
  /** Local day of every queued blockless COMPLETED session write. */
  journalledCompletedSessionDays?: readonly string[];
}

/**
 * "How many blockless sessions did the user finish today?", answered from the
 * two DURABLE tiers — #737 C1 re-score GAP 4.
 *
 * ## Why this exists at all
 *
 * `completedToday` counted calendar blocks and nothing else. Audit P0#2's fix
 * made a session on an UNSCHEDULED task persist a real `execution_sessions`
 * row (`calendar_block_id: null`), so the exact path that fix rescued was the
 * one the day's summary could not see: a finished blockless session read back
 * as `0 COMPLETED TODAY`. That is the inverse of a phantom save — the app
 * under-reporting a write that genuinely happened.
 *
 * ## WHY IT DOES NOT COUNT THE REDUCER'S OWN ROWS, WHICH IS THE WHOLE TRICK
 *
 * The obvious implementation — filter `state.executionSessions` — DOUBLE
 * COUNTED, and this was measured, not guessed. The merge used to drop a local
 * row only when the per-mount drop-set named it, and nothing ever populated
 * `persistedSessionIdByLocalIdRef`, so after a sync the reducer held BOTH the
 * optimistic `session-N` row and the account's uuid row for one session. A
 * probe against the real reducer returned
 * `["794b7d18-…", "session-1"]` — one finished session, two rows. Counting
 * those would have replaced an under-report with an over-report, which is the
 * worse of the two errors and the exact class C1 exists to end.
 *
 * #844 retired that double at its source — `mergePersistedSessions` now names
 * the account twin by (task, block) and retires the device copy in the same
 * dispatch that adds it. The durable-tier read below stays anyway: it is the
 * design that cannot double-count even if a new seam appears, and the journal
 * tier is still the only place an offline session exists at all.
 *
 * So the count reads the two tiers that hold exactly one record each, the same
 * shape `resolveDayClose` and `resolveLoggedWinsForDay` already use:
 *
 *  - the ACCOUNT tier — sessions whose id is an account uuid. A local row can
 *    never be one (`nextId` mints `session-N`), and `mergePersistedRows` uses
 *    this same discriminator to decide what is an account row.
 *  - the DEVICE JOURNAL tier — queued `execution_session` writes this device
 *    holds and has not sent. Without it a session finished offline or signed
 *    out would not be counted at all, which is the original bug one tier down.
 *
 * A session is in exactly one of them: the journal entry is deleted the moment
 * the account takes the write. The optimistic reducer row is in neither, and
 * that is correct — it is a copy of whichever tier holds the real record.
 *
 * A session that reached NEITHER tier (the device refused to journal it) is
 * not counted, and must not be: `markDeviceStorageBlocked` has already told
 * the user that browser will not hold their work.
 *
 * ## The other two rules, each chosen rather than fallen into
 *
 * 1. **Only `calendar_block_id === null`.** A session attached to a block is
 *    already represented by that block in the count above; counting it again
 *    would turn one hour of work into two.
 * 2. **`outcome`, never `status`.** `findLiveSession` (`lib/workflow/
 *    execution.ts`) records why in full: status is DERIVED, and every session
 *    the pre-P0#1 `start_execution_session` abandoned reads back from the
 *    account as `outcome:"partial"` and therefore status `"running"`. Counting
 *    on status would file those ghosts as today's completions.
 *
 * There is deliberately NO dedupe by task: two genuine blockless sessions on
 * one task are two completions, and collapsing them would be the same class of
 * under-report this function exists to end.
 *
 * An account row with no `created_at` is not counted — the column is NOT NULL
 * and the schema requires it, so an absent one means a row this app cannot
 * date, and choosing a day for it would invent the fact Close reports.
 */
function countCompletedBlocklessSessions(
  state: WorkflowState,
  now: Date,
  journalledDays: readonly string[],
): number {
  const accountTier = state.executionSessions.filter(
    (session) =>
      isUuid(session.id) &&
      session.calendar_block_id === null &&
      session.outcome === "completed" &&
      typeof session.created_at === "string" &&
      isSameCalendarDay(session.created_at, now),
  ).length;

  const today = toIsoDate(now);
  const deviceTier = journalledDays.filter((day) => day === today).length;

  return accountTier + deviceTier;
}

/**
 * Close moment view model — today's completed/missed counts, carry-forward
 * tasks, and tomorrow's first move. Carry-forward rule (kept deliberately
 * simple): active/scheduled tasks linked to at least one of today's missed
 * blocks, deduped by task id.
 */
export function buildCloseVM(
  state: WorkflowState,
  options: NowOption &
    DayCloseOption &
    LoggedWinsOption &
    CompletedSessionsOption,
): CloseVM {
  const { now } = options;

  const todayBlocksRaw = state.calendarBlocks.filter(
    (block) =>
      block.status !== "cancelled" && isSameCalendarDay(block.start_at, now),
  );

  const completedToday =
    todayBlocksRaw.filter((block) => block.status === "completed").length +
    countCompletedBlocklessSessions(
      state,
      now,
      options.journalledCompletedSessionDays ?? [],
    );
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

  // #737 C1 re-score GAP 1. Keyed on the LOCAL calendar day — the same
  // derivation `confirmWin` files the win under (`localIsoDate`) and the same
  // one `dayClose` below resolves against. A UTC-keyed lookup here would find
  // nothing after 17:00 west of Greenwich, which is precisely when the Close
  // moment is designed to be used, and the win logged ten minutes ago would be
  // offered again.
  const todayIso = toIsoDate(now);
  const loggedWinRecordsToday = resolveLoggedWinsForDay(
    options.accountLoggedWins ?? [],
    options.journalledLoggedWins ?? [],
    todayIso,
  );
  const loggedWinsToday: LoggedWinVM[] = loggedWinRecordsToday.map((record) => {
    const task = state.tasks.find((t) => t.id === record.taskId);
    return {
      taskId: record.taskId,
      // The DURABLE row's title, not the task's. The user may have edited the
      // wording before logging it, and what was recorded is what gets read
      // back — the reading list must not quietly show a different sentence.
      title: record.title,
      areaLabel: task ? areaName(state.areas, task.area_id) : "",
    };
  });
  // Suppression covers every id a logged win answers to (see
  // `LoggedWinRecord.taskIdAliases`); the VM list above stays one-per-win so
  // the verdict's `· N wins logged` tail counts wins, not names.
  const loggedWinTaskIds = new Set(
    loggedWinRecordsToday.flatMap((record) => loggedWinTaskIdsOf(record)),
  );

  const winCandidates: { taskId: string; title: string; areaLabel: string }[] =
    [];
  const winSeen = new Set<string>();
  for (const block of todayBlocksRaw) {
    if (block.status !== "completed" || !block.task_id) continue;
    if (winSeen.has(block.task_id)) continue;
    // Already logged today, on either tier: not an offer any more. This is the
    // screen's half of GAP 1 — without it the candidate is re-derived from the
    // completed block on every mount, in every tab, forever.
    if (loggedWinTaskIds.has(block.task_id)) continue;
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

  // Keyed on the LOCAL calendar day, the same derivation the write path uses
  // (`localIsoDate`) and the same one `completedToday`/`missedToday` above are
  // counted over. See `lib/review/dayClose.ts` for why that had to be said out
  // loud.
  const dayClose = resolveDayClose(
    options.accountClosedDays ?? [],
    options.journalledClosedDays ?? [],
    todayIso,
  );

  return {
    completedToday,
    missedToday,
    carryForward,
    tomorrowFirstMove,
    winCandidates,
    loggedWinsToday,
    rollupDrafts,
    dayClose,
  };
}

/**
 * The one-line payoff shown beside "Today is closed" — audit P0#4's other
 * half ("finishing something still feels like nothing happened").
 *
 * Composed ONLY from numbers the Close card is already showing, so the verdict
 * can never contradict the detail directly above it. That is also why it is a
 * pure function of four counts rather than a re-derivation from the persisted
 * summary: the row records what was saved, this line reports what the user is
 * looking at, and there is no third version of the day for them to reconcile.
 *
 * Zeroes are stated, not hidden: "0 missed" on a clean day is the good news,
 * and a day with nothing in it is allowed to say so plainly rather than
 * rendering a blank.
 */
export function formatDayClosePayoff(input: {
  completed: number;
  missed: number;
  carriedForward: number;
  winsLogged: number;
}): string {
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;

  const parts = [
    `${input.completed} completed`,
    `${input.missed} missed`,
    input.carriedForward === 0
      ? "nothing carried forward"
      : `${input.carriedForward} carried forward`,
  ];

  if (input.winsLogged > 0) {
    parts.push(`${plural(input.winsLogged, "win")} logged`);
  }

  return `${parts.join(" · ")}.`;
}

const ROLLUP_WEEK_DAYS = 7;

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
