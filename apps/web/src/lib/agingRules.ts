/**
 * S4 (#256): deterministic waiting-on aging + commitment surfacing rules.
 *
 * Rule-based only — zero AI calls, zero prompt changes. This module reads the
 * S1/S3 task columns (`waiting_on_person_id`, `waiting_on_since`,
 * `is_commitment`, `committed_to_person_id`) that S3 (#255 / PR #372)
 * populates on triage accept, and applies pure age-threshold math.
 *
 * Threshold shape: this is the first code consumer of the `global_defaults`
 * pattern described in docs/DATA_MODEL.md section 3.2
 * (`default_health_thresholds_json`). No `global_defaults` table reader
 * exists yet, so thresholds are passed in as plain data
 * (`AgingThresholds` / per-area override map) shaped like that frozen jsonb
 * column would hold, rather than adding a new schema/migration (out of
 * scope for S4). When a real `global_defaults` reader lands, it can produce
 * this same shape.
 *
 * Threshold basis: docs/DATA_MODEL.md section 11 froze "waiting-on flagged
 * after 3 days" with a per-area override, and applies the identical default
 * and override mechanism to commitment aging. "After 3 days" is a strict
 * greater-than comparison — an item that is exactly 3 days (72h) old is NOT
 * yet flagged; an item just over 3 days old is flagged.
 *
 * Commitment age anchor: commitments have no dedicated "committed since"
 * column. `due_at` is nullable and represents a deadline, not an age
 * anchor, so it is deliberately not used for aging. `created_at` is always
 * present and is used as the commitment age anchor. "Sorted by age" means
 * oldest `created_at` first (longest-outstanding commitment surfaces first).
 *
 * Scope of "open": both waiting-on and commitment rules exclude tasks whose
 * status is done, dropped, or archived (TASK_STATUSES closed states).
 */

const DEFAULT_WAITING_ON_THRESHOLD_DAYS = 3;
const DEFAULT_COMMITMENT_THRESHOLD_DAYS = 3;

const CLOSED_TASK_STATUSES = new Set(["done", "dropped", "archived"]);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AgingRuleTask {
  id: string;
  area_id: string;
  title: string;
  status: string;
  created_at: string;
  waiting_on_person_id?: string | null;
  waiting_on_since?: string | null;
  is_commitment?: boolean | null;
  committed_to_person_id?: string | null;
}

/** Shaped like `global_defaults.default_health_thresholds_json` would hold. */
export interface AgingThresholds {
  waitingOnDays: number;
  commitmentDays: number;
}

export const DEFAULT_AGING_THRESHOLDS: AgingThresholds = {
  waitingOnDays: DEFAULT_WAITING_ON_THRESHOLD_DAYS,
  commitmentDays: DEFAULT_COMMITMENT_THRESHOLD_DAYS,
};

/** Per-area override map, keyed by `area_id`. Mirrors the `global_defaults` override pattern. */
export type AreaAgingThresholdOverrides = Record<
  string,
  Partial<AgingThresholds>
>;

export interface AgingRulesOptions {
  now?: Date;
  defaults?: AgingThresholds;
  areaOverrides?: AreaAgingThresholdOverrides;
}

export interface AgingWaitingOnItem<
  TTask extends AgingRuleTask = AgingRuleTask,
> {
  task: TTask;
  waitingOnPersonId: string;
  waitingOnSince: string;
  ageDays: number;
  thresholdDays: number;
}

export interface StaleCommitmentItem<
  TTask extends AgingRuleTask = AgingRuleTask,
> {
  task: TTask;
  committedToPersonId: string | null;
  committedSince: string;
  ageDays: number;
  thresholdDays: number;
}

function isOpenTask(task: AgingRuleTask): boolean {
  return !CLOSED_TASK_STATUSES.has(task.status);
}

function resolveThresholds(
  areaId: string,
  options: AgingRulesOptions,
): AgingThresholds {
  const defaults = options.defaults ?? DEFAULT_AGING_THRESHOLDS;
  const override = options.areaOverrides?.[areaId];

  return {
    waitingOnDays: override?.waitingOnDays ?? defaults.waitingOnDays,
    commitmentDays: override?.commitmentDays ?? defaults.commitmentDays,
  };
}

function ageInDays(since: string, now: Date): number | null {
  const sinceMs = Date.parse(since);
  if (Number.isNaN(sinceMs)) return null;

  return (now.getTime() - sinceMs) / MS_PER_DAY;
}

/**
 * Waiting-on items whose age strictly exceeds the (per-area-overridable)
 * threshold. Tasks missing either `waiting_on_person_id` or
 * `waiting_on_since` are skipped — S3 sets both together, so a null in
 * either column means "not waiting on anyone."
 */
export function findAgingWaitingOnItems<TTask extends AgingRuleTask>(
  tasks: readonly TTask[],
  options: AgingRulesOptions = {},
): AgingWaitingOnItem<TTask>[] {
  const now = options.now ?? new Date();
  const items: AgingWaitingOnItem<TTask>[] = [];

  for (const task of tasks) {
    if (!isOpenTask(task)) continue;
    if (!task.waiting_on_person_id || !task.waiting_on_since) continue;

    const ageDays = ageInDays(task.waiting_on_since, now);
    if (ageDays === null) continue;

    const { waitingOnDays: thresholdDays } = resolveThresholds(
      task.area_id,
      options,
    );

    if (ageDays > thresholdDays) {
      items.push({
        task,
        waitingOnPersonId: task.waiting_on_person_id,
        waitingOnSince: task.waiting_on_since,
        ageDays,
        thresholdDays,
      });
    }
  }

  return items.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Open commitments owed by the user, sorted oldest-first by `created_at`
 * (see module doc for the age-anchor rationale). Returns every open
 * commitment, not only stale ones — callers that only want the aging subset
 * should use `findStaleCommitments`.
 */
export function findOpenCommitments<TTask extends AgingRuleTask>(
  tasks: readonly TTask[],
): TTask[] {
  return tasks
    .filter((task) => isOpenTask(task) && task.is_commitment === true)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/**
 * Open commitments whose age (since `created_at`) strictly exceeds the
 * (per-area-overridable) commitment threshold. Sorted oldest-first.
 */
export function findStaleCommitments<TTask extends AgingRuleTask>(
  tasks: readonly TTask[],
  options: AgingRulesOptions = {},
): StaleCommitmentItem<TTask>[] {
  const now = options.now ?? new Date();
  const items: StaleCommitmentItem<TTask>[] = [];

  for (const task of findOpenCommitments(tasks)) {
    const ageDays = ageInDays(task.created_at, now);
    if (ageDays === null) continue;

    const { commitmentDays: thresholdDays } = resolveThresholds(
      task.area_id,
      options,
    );

    if (ageDays > thresholdDays) {
      items.push({
        task,
        committedToPersonId: task.committed_to_person_id ?? null,
        committedSince: task.created_at,
        ageDays,
        thresholdDays,
      });
    }
  }

  return items.sort((a, b) => b.ageDays - a.ageDays);
}

export interface AgingSummary {
  agingWaitingOnCount: number;
  staleCommitmentCount: number;
}

/** Rule-based counts for the health surface. No AI, no persistence. */
export function summarizeAging<TTask extends AgingRuleTask>(
  tasks: readonly TTask[],
  options: AgingRulesOptions = {},
): AgingSummary {
  return {
    agingWaitingOnCount: findAgingWaitingOnItems(tasks, options).length,
    staleCommitmentCount: findStaleCommitments(tasks, options).length,
  };
}
