import { beforeEach, describe, expect, it } from "vitest";
import {
  RUNNING_SESSION_KEY,
  STALE_AFTER_MS,
  readRunningSession,
  writeRunningSession,
} from "./runningSession";

/**
 * #737 C1 card 1 / card 6 — the device record of a running session.
 *
 * The claims under test are the two halves of "never nothing, and never a
 * ghost": a session survives leaving, AND an abandoned one does not haunt the
 * user from localStorage the way the old `outcome:'partial'` row haunted them
 * from the database.
 */

const START_MS = Date.UTC(2026, 6, 26, 10, 0, 0);

function at(offsetMs: number) {
  return () => START_MS + offsetMs;
}

describe("running session device record", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("survives the tab that made it", () => {
    writeRunningSession(
      { activeTaskId: "task-1", running: true, remaining: 1500, total: 1500 },
      at(0),
    );

    expect(readRunningSession(at(0))).toEqual({
      activeTaskId: "task-1",
      running: true,
      remaining: 1500,
      total: 1500,
    });
  });

  it("charges the time that passed while the tab was gone", () => {
    // Resuming at the value the clock had when the tab closed would be a lie
    // about time — the bug `useFocusSession`'s drift-free anchor exists to end.
    writeRunningSession(
      { activeTaskId: "task-1", running: true, remaining: 1500, total: 1500 },
      at(0),
    );

    expect(readRunningSession(at(60_000))?.remaining).toBe(1440);
  });

  it("does not charge time to a PAUSED session", () => {
    writeRunningSession(
      { activeTaskId: "task-1", running: false, remaining: 900, total: 1500 },
      at(0),
    );

    expect(readRunningSession(at(60_000))?.remaining).toBe(900);
  });

  it("keeps the session's own age across per-second rewrites", () => {
    // The record is rewritten every tick. If the expiry clock measured the
    // latest write instead of the start, a session left running would refresh
    // its own lease forever and never expire.
    writeRunningSession(
      { activeTaskId: "task-1", running: true, remaining: 1500, total: 1500 },
      at(0),
    );
    writeRunningSession(
      { activeTaskId: "task-1", running: true, remaining: 1499, total: 1500 },
      at(1000),
    );

    const stored = JSON.parse(
      window.localStorage.getItem(RUNNING_SESSION_KEY) ?? "{}",
    ) as { started_at_ms: number; saved_at_ms: number };
    expect(stored.started_at_ms).toBe(START_MS);
    expect(stored.saved_at_ms).toBe(START_MS + 1000);
  });

  it("drops an abandoned session instead of haunting every moment with it", () => {
    // Yesterday's session, never ended. Restoring it would show
    // "still running · 00:00 left" until the user filed an outcome for work
    // they finished in their head a day ago — the database ghost, relocated.
    writeRunningSession(
      { activeTaskId: "task-1", running: true, remaining: 1500, total: 1500 },
      at(0),
    );

    expect(readRunningSession(at(STALE_AFTER_MS))).toBeNull();
    expect(window.localStorage.getItem(RUNNING_SESSION_KEY)).toBeNull();
  });

  it("still restores a long-paused session inside the window", () => {
    writeRunningSession(
      { activeTaskId: "task-1", running: false, remaining: 900, total: 1500 },
      at(0),
    );

    expect(readRunningSession(at(STALE_AFTER_MS - 1000))).not.toBeNull();
  });

  it("removes the record when the session ends", () => {
    writeRunningSession(
      { activeTaskId: "task-1", running: true, remaining: 1500, total: 1500 },
      at(0),
    );
    writeRunningSession(
      { activeTaskId: null, running: false, remaining: 0, total: 0 },
      at(1000),
    );

    expect(window.localStorage.getItem(RUNNING_SESSION_KEY)).toBeNull();
    expect(readRunningSession(at(1000))).toBeNull();
  });

  it("ignores a malformed or foreign record rather than trusting it", () => {
    window.localStorage.setItem(RUNNING_SESSION_KEY, "not json");
    expect(readRunningSession(at(0))).toBeNull();

    window.localStorage.setItem(RUNNING_SESSION_KEY, JSON.stringify({ a: 1 }));
    expect(readRunningSession(at(0))).toBeNull();
  });
});
