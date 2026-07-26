import { describe, expect, it } from "vitest";
import {
  findLiveSession,
  markCurrentSession,
  startExecutionSession,
} from "./execution";
import type { WorkflowState } from "./shared";
import type { Phase2MockExecutionSession } from "../types";

/**
 * #737 — Final UX Loop C1, Target Card 1: "a focus session ALWAYS produces
 * exactly one truthful record: user-chosen outcome only, never a silent
 * 'partial', never nothing."
 *
 * These are the reducer-tier guards for the two audit P0s. Each was proven
 * able to fail by reverting the fix and watching it go red — see the PR's
 * red-green evidence.
 */

const AREA_ID = "area-main-job";
const USER_ID = "user-1";

function task(id: string, status: string) {
  return {
    id,
    user_id: USER_ID,
    area_id: AREA_ID,
    project_id: null,
    source_capture_item_id: null,
    title: `Task ${id}`,
    description: null,
    status,
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: 25,
    estimated_minutes_high: 60,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: "2026-07-20T09:00:00.000Z",
    updated_at: "2026-07-26T09:00:00.000Z",
  } as unknown as WorkflowState["tasks"][number];
}

function emptyState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    areas: [
      {
        id: AREA_ID,
        user_id: USER_ID,
        name: "Main Job",
        color: "#2563eb",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
    ...overrides,
  } as unknown as WorkflowState;
}

function session(
  id: string,
  overrides: Partial<Phase2MockExecutionSession> = {},
): Phase2MockExecutionSession {
  return {
    id,
    user_id: USER_ID,
    area_id: AREA_ID,
    task_id: "task-old",
    calendar_block_id: null,
    planned_minutes: 60,
    actual_minutes: 30,
    paused_minutes: 0,
    distraction_minutes: 0,
    productivity_rating: null,
    status: "completed",
    outcome: "completed",
    cap_outcome: null,
    notes: null,
    ...overrides,
  };
}

describe("#737 C1 card 1 — starting a session", () => {
  it("starts a session on an unscheduled task (audit P0#2)", () => {
    // The regression this pins: `status === "scheduled"` alone meant the
    // Start moment's "oldest active commitment" — an `active` task with no
    // block — ran a whole session and kept nothing.
    const state = emptyState({ tasks: [task("task-1", "active")] });

    const next = startExecutionSession(state, "task-1");

    expect(next.executionSessions).toHaveLength(1);
    expect(next.executionSessions[0]!.task_id).toBe("task-1");
    expect(next.executionSessions[0]!.calendar_block_id).toBeNull();
  });

  it("still starts a session on a scheduled task", () => {
    const state = emptyState({ tasks: [task("task-1", "scheduled")] });

    expect(
      startExecutionSession(state, "task-1").executionSessions,
    ).toHaveLength(1);
  });

  it("refuses to start on a task that is done", () => {
    // The widening is to STARTABLE statuses, not to everything: finished and
    // dropped work must not be startable.
    const state = emptyState({ tasks: [task("task-1", "done")] });

    expect(startExecutionSession(state, "task-1").executionSessions).toEqual(
      [],
    );
  });

  it("opens with no verdict, never a 'partial' the user did not choose", () => {
    // The heart of audit P0#1: every session used to open at `partial`, so an
    // abandoned one read back as a partial nobody chose.
    const state = emptyState({ tasks: [task("task-1", "active")] });

    const started = startExecutionSession(state, "task-1")
      .executionSessions[0]!;

    expect(started.outcome).toBe("in_progress");
    expect(started.status).toBe("running");
    expect(started.actual_minutes).toBeNull();
  });
});

describe("#737 C1 card 1 — recording the outcome", () => {
  it("writes the outcome onto the LIVE session, not whatever is newest", () => {
    // `executionSessions[0]` is the newest row, which after a persisted sync
    // is whatever the account returned last. Marking by index would have put
    // the user's outcome on an unrelated, already-closed session.
    const state = emptyState({
      tasks: [task("task-live", "active")],
      executionSessions: [
        session("session-newest-closed", { status: "completed" }),
        session("session-live", {
          task_id: "task-live",
          status: "running",
          outcome: "in_progress",
          actual_minutes: null,
        }),
      ],
    });

    const next = markCurrentSession(state, "partial", { actualMinutes: 18 });

    const live = next.executionSessions.find((s) => s.id === "session-live")!;
    const untouched = next.executionSessions.find(
      (s) => s.id === "session-newest-closed",
    )!;
    expect(live.outcome).toBe("partial");
    expect(live.actual_minutes).toBe(18);
    expect(untouched.outcome).toBe("completed");
    expect(untouched.actual_minutes).toBe(30);
  });

  it("pausing records no verdict", () => {
    const state = emptyState({
      executionSessions: [
        session("session-live", {
          status: "running",
          outcome: "in_progress",
          actual_minutes: null,
        }),
      ],
    });

    const next = markCurrentSession(state, "paused", { actualMinutes: 5 });

    expect(next.executionSessions[0]!.outcome).toBe("in_progress");
  });

  it("does nothing when no session is live", () => {
    const state = emptyState({
      executionSessions: [session("session-closed", { status: "completed" })],
    });

    expect(markCurrentSession(state, "completed", { actualMinutes: 40 })).toBe(
      state,
    );
  });
});

describe("#737 C1 card 1 — legacy ghosts must not be mistaken for the live session", () => {
  /**
   * The pre-#737 start path wrote `outcome:'partial' + actual_minutes:null`,
   * and `sessionStatusFromOutcome` reads that pair back as status "running".
   * Every abandoned session already in a real database is one of these, they
   * arrive on every rehydrate, and `mergePersistedRows` puts persisted rows
   * AHEAD of the local live session. So a status-based search finds the ghost
   * first — and the user's chosen outcome, plus the journalled account write,
   * would be filed against the ghost's task.
   */
  const ghost = session("session-legacy-ghost", {
    task_id: "task-last-tuesday",
    status: "running",
    outcome: "partial",
    actual_minutes: null,
  });

  it("finds the real in-progress session, not a rehydrated ghost ahead of it", () => {
    const state = emptyState({
      executionSessions: [
        ghost,
        session("session-live", {
          task_id: "task-today",
          status: "running",
          outcome: "in_progress",
          actual_minutes: null,
        }),
      ],
    });

    expect(findLiveSession(state)?.id).toBe("session-live");
  });

  it("records today's outcome on today's session, leaving the ghost alone", () => {
    const state = emptyState({
      executionSessions: [
        ghost,
        session("session-live", {
          task_id: "task-today",
          status: "running",
          outcome: "in_progress",
          actual_minutes: null,
        }),
      ],
    });

    const next = markCurrentSession(state, "completed", { actualMinutes: 42 });

    expect(next.executionSessions.find((s) => s.id === "session-live")).toEqual(
      expect.objectContaining({ outcome: "completed", actual_minutes: 42 }),
    );
    expect(
      next.executionSessions.find((s) => s.id === "session-legacy-ghost"),
    ).toEqual(
      expect.objectContaining({ outcome: "partial", actual_minutes: null }),
    );
  });

  it("treats a lone ghost as no live session at all", () => {
    const state = emptyState({ executionSessions: [ghost] });

    expect(findLiveSession(state)).toBeNull();
    expect(markCurrentSession(state, "completed", { actualMinutes: 42 })).toBe(
      state,
    );
  });
});

describe("findLiveSession", () => {
  it("keeps a PAUSED session findable — pausing is not a verdict", () => {
    expect(
      findLiveSession(
        emptyState({
          executionSessions: [
            session("a", { status: "completed" }),
            session("b", { status: "paused", outcome: "in_progress" }),
          ],
        }),
      )?.id,
    ).toBe("b");
  });

  it("ignores sessions that already have a verdict", () => {
    expect(
      findLiveSession(
        emptyState({
          executionSessions: [session("a", { status: "missed" })],
        }),
      ),
    ).toBeNull();
  });
});
