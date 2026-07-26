/**
 * #758 — a place for silently-failed meta-learning writes to be counted.
 *
 * `logLearningWriteFailure` was already the right SHAPE: a triage decision must
 * never fail because the record of it could not be written, so the write is
 * fire-and-forget and the failure is calm. What was missing is that the failure
 * landed in devtools and nowhere else. Every `suggestion_records` /
 * `override_records` write failed for the whole life of those tables and no
 * surface ever said so — Health included.
 *
 * This is the minimum honest counter: an in-memory tally the Health screen can
 * read, so "how LifeOS learns from your decisions" stops being the one
 * subsystem that cannot report itself.
 *
 * SCOPE, stated so no copy overclaims it: module state in the browser tab that
 * loaded it. `getHealthDashboard` is only ever called from `HealthView`, which
 * is client-only, so this is never shared across users. It resets on reload,
 * which is why every sentence built from it says "since you opened this page"
 * rather than implying a durable count.
 */

export interface LearningWriteFailureSnapshot {
  /** Failures counted since this page was opened. */
  count: number;
  /** Tables involved, for the developer layer only. */
  tables: string[];
}

let failureCount = 0;
const failureTables = new Set<string>();

export function recordLearningWriteFailure(table: string) {
  failureCount += 1;
  failureTables.add(table);
}

export function getLearningWriteFailureSnapshot(): LearningWriteFailureSnapshot {
  return {
    count: failureCount,
    tables: [...failureTables].sort(),
  };
}

/** Test-only: module state would otherwise leak between cases. */
export function resetLearningWriteFailures() {
  failureCount = 0;
  failureTables.clear();
}
