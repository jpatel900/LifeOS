import type { WorkflowState } from "@/lib/workflow";

/**
 * FR-028 re-entry amnesty, packet F-G2a: deterministic absence detection.
 *
 * Pure functions only — no writes, no AI, no ambient clock. Callers inject
 * `now` (test-pinned per floor plan R3); the absence signal is derived from
 * the newest activity timestamp already present in workflow state, so this
 * packet adds no storage and no new column.
 */

/** FR-028 seed default; a settings surface may override N later. */
export const DEFAULT_RE_ENTRY_THRESHOLD_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AbsenceResult {
  /** True when the gap since the last recorded activity is >= the threshold. */
  absent: boolean;
  /** Whole days (floored) since the last recorded activity; 0 when none. */
  absenceDays: number;
  /** ISO timestamp the absence is measured from, or null when no activity exists. */
  lastActivityAt: string | null;
}

function toEpoch(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Newest activity timestamp recorded anywhere in workflow state. Reads only
 * fields that always exist on their entities (created_at everywhere;
 * updated_at where the entity carries one). Returns null for a pristine
 * state — a first-ever open is onboarding, not a re-entry.
 */
export function latestActivityTimestamp(state: WorkflowState): string | null {
  let latest: number | null = null;
  let latestIso: string | null = null;

  const consider = (value: string | null | undefined) => {
    const epoch = toEpoch(value);
    if (epoch !== null && (latest === null || epoch > latest)) {
      latest = epoch;
      latestIso = value ?? null;
    }
  };

  for (const capture of state.captureItems) consider(capture.created_at);
  for (const draft of state.taskDrafts) consider(draft.created_at);
  for (const proposal of state.timeBlockProposals)
    consider(proposal.created_at);
  for (const block of state.calendarBlocks) {
    consider(block.created_at);
    consider(block.updated_at);
  }
  for (const task of state.tasks) {
    consider(task.created_at);
    consider(task.updated_at);
  }

  return latestIso;
}

/**
 * Deterministic absence rule: absent when `now - lastActivityAt` is at least
 * `thresholdDays` full days. No activity at all is never an absence (nothing
 * to return to); a malformed timestamp behaves like no activity.
 */
export function detectAbsence(input: {
  lastActivityAt: string | null;
  now: Date;
  thresholdDays?: number;
}): AbsenceResult {
  const thresholdDays = input.thresholdDays ?? DEFAULT_RE_ENTRY_THRESHOLD_DAYS;
  const lastEpoch = toEpoch(input.lastActivityAt);

  if (lastEpoch === null) {
    return { absent: false, absenceDays: 0, lastActivityAt: null };
  }

  const elapsedMs = input.now.getTime() - lastEpoch;
  const absenceDays = Math.max(0, Math.floor(elapsedMs / MS_PER_DAY));

  return {
    absent: absenceDays >= thresholdDays,
    absenceDays,
    lastActivityAt: input.lastActivityAt,
  };
}
