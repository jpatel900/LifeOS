/**
 * #737 C1 card 1 / card 6 — the running focus session, held on the device.
 *
 * ## Why this exists
 *
 * The audit's P0#1 harm was that a focus session was easy to lose and left a
 * record behind that the user never chose. Card 6 states the shape of the
 * fix: "navigation never ends a session; leaving shows a persistent 'session
 * running' affordance to return."
 *
 * Before this, the running session lived only in `useFlowFocusSession`'s
 * `useState`. That survives a moment switch (it is a conditional render, not
 * an unmount) but dies on a reload, a crash, or a closed tab — with nothing
 * anywhere to say a session had been running.
 *
 * ## What this is NOT
 *
 * It is not a record. A running session has no outcome yet, so nothing about
 * it belongs in `execution_sessions` — that row is created once, from the end
 * sheet's chosen outcome, through the pending-writes journal. This module
 * holds only enough to put the user back where they were.
 *
 * `localStorage`, not `sessionStorage`: the whole point is surviving the tab.
 *
 * ## Clock handling
 *
 * `remaining` is stored alongside `saved_at_ms`, and a running session
 * recomputes `remaining` from the wall clock on read. Storing a decremented
 * counter alone would resume a session at the value it had when the tab
 * closed, which would be a lie about time — the same class of bug
 * `useFocusSession`'s drift-free anchor was written to end.
 */

export const RUNNING_SESSION_KEY = "lifeos.running-session";

/** Device record of a session in progress. Snake_case: it is stored data. */
export interface StoredRunningSession {
  task_id: string | null;
  running: boolean;
  /** Seconds left when the record was written. */
  remaining: number;
  /** Total seconds the session was set to run for, including extensions. */
  total: number;
  saved_at_ms: number;
}

/** The in-memory shape the Flow moment works in. */
export interface RunningSessionState {
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
}

function isStoredRunningSession(value: unknown): value is StoredRunningSession {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.task_id === null || typeof record.task_id === "string") &&
    typeof record.running === "boolean" &&
    typeof record.remaining === "number" &&
    typeof record.total === "number" &&
    typeof record.saved_at_ms === "number"
  );
}

/**
 * A session is worth remembering only if it has a task or a clock. An empty
 * record is indistinguishable from no session and would light up the "session
 * running" affordance over nothing.
 */
export function hasRunningSession(state: RunningSessionState): boolean {
  return state.activeTaskId !== null || state.total > 0;
}

export function readRunningSession(
  now: () => number = Date.now,
): RunningSessionState | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RUNNING_SESSION_KEY);
  } catch {
    // Blocked storage (private mode, quota). No device memory, no restore.
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isStoredRunningSession(parsed)) return null;

  // A running clock kept running while the tab was gone. Charge the elapsed
  // time rather than resuming where it was paused by the tab closing.
  const elapsedSeconds = parsed.running
    ? Math.max(0, Math.floor((now() - parsed.saved_at_ms) / 1000))
    : 0;
  const remaining = Math.max(0, parsed.remaining - elapsedSeconds);

  const restored: RunningSessionState = {
    activeTaskId: parsed.task_id,
    running: parsed.running,
    remaining,
    total: parsed.total,
  };

  return hasRunningSession(restored) ? restored : null;
}

export function writeRunningSession(
  state: RunningSessionState,
  now: () => number = Date.now,
): void {
  try {
    if (!hasRunningSession(state)) {
      window.localStorage.removeItem(RUNNING_SESSION_KEY);
      return;
    }
    const record: StoredRunningSession = {
      task_id: state.activeTaskId,
      running: state.running,
      remaining: state.remaining,
      total: state.total,
      saved_at_ms: now(),
    };
    window.localStorage.setItem(RUNNING_SESSION_KEY, JSON.stringify(record));
  } catch {
    // Blocked storage: the session still runs in this tab, it just cannot be
    // recovered from another one. Nothing here may claim otherwise.
  }
}

export function clearRunningSession(): void {
  try {
    window.localStorage.removeItem(RUNNING_SESSION_KEY);
  } catch {
    // Nothing to do — see writeRunningSession.
  }
}
