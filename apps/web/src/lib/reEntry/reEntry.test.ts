import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import {
  DEFAULT_RE_ENTRY_THRESHOLD_DAYS,
  detectAbsence,
  latestActivityTimestamp,
} from "./detect";
import { buildWhileYouWereOutSummary } from "./summary";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "@/lib/types";
import type { Phase2CaptureItem } from "@lifeos/schemas";

/**
 * FR-028 packet F-G2a: deterministic boundaries, clock injected (floor plan
 * R3) — no ambient Date.now anywhere in these tests.
 */

const NOW = new Date("2026-07-05T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeCapture(
  overrides: Partial<Phase2CaptureItem> & { id: string },
): Phase2CaptureItem {
  return {
    user_id: "user-1",
    area_id: null,
    raw_text: `capture ${overrides.id}`,
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: daysBefore(1),
    ...overrides,
  };
}

function makeTask(
  overrides: Partial<Phase2MockTask> & { id: string; title: string },
): Phase2MockTask {
  return {
    user_id: "user-1",
    area_id: "area-1",
    project_id: null,
    source_capture_item_id: null,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: daysBefore(1),
    updated_at: daysBefore(1),
    ...overrides,
  } as Phase2MockTask;
}

function makeBlock(
  overrides: Partial<Phase2MockCalendarBlock> & { id: string },
): Phase2MockCalendarBlock {
  return {
    user_id: "user-1",
    area_id: "area-1",
    proposal_id: null,
    task_id: null,
    google_event_id: null,
    start_at: daysBefore(2),
    end_at: daysBefore(2),
    status: "scheduled",
    created_at: daysBefore(10),
    updated_at: daysBefore(10),
    ...overrides,
  } as Phase2MockCalendarBlock;
}

function stateWith(partial: Partial<WorkflowState>): WorkflowState {
  return { ...createInitialWorkflowState(), ...partial };
}

describe("detectAbsence", () => {
  it("is never absent with no recorded activity (first open is onboarding)", () => {
    expect(detectAbsence({ lastActivityAt: null, now: NOW })).toEqual({
      absent: false,
      absenceDays: 0,
      lastActivityAt: null,
    });
  });

  it("is not absent one instant under the threshold", () => {
    const justUnder = new Date(
      NOW.getTime() - DEFAULT_RE_ENTRY_THRESHOLD_DAYS * 86_400_000 + 1,
    ).toISOString();
    const result = detectAbsence({ lastActivityAt: justUnder, now: NOW });
    expect(result.absent).toBe(false);
    expect(result.absenceDays).toBe(DEFAULT_RE_ENTRY_THRESHOLD_DAYS - 1);
  });

  it("is absent at exactly the threshold", () => {
    const exact = daysBefore(DEFAULT_RE_ENTRY_THRESHOLD_DAYS);
    const result = detectAbsence({ lastActivityAt: exact, now: NOW });
    expect(result.absent).toBe(true);
    expect(result.absenceDays).toBe(DEFAULT_RE_ENTRY_THRESHOLD_DAYS);
  });

  it("honors a configured threshold", () => {
    const result = detectAbsence({
      lastActivityAt: daysBefore(5),
      now: NOW,
      thresholdDays: 7,
    });
    expect(result.absent).toBe(false);
    expect(result.absenceDays).toBe(5);
  });

  it("treats a malformed timestamp like no activity", () => {
    expect(
      detectAbsence({ lastActivityAt: "not-a-date", now: NOW }).absent,
    ).toBe(false);
  });
});

describe("latestActivityTimestamp", () => {
  it("returns null for a pristine state", () => {
    expect(latestActivityTimestamp(createInitialWorkflowState())).toBeNull();
  });

  it("picks the newest timestamp across entity kinds", () => {
    const state = stateWith({
      captureItems: [makeCapture({ id: "c1", created_at: daysBefore(9) })],
      tasks: [
        makeTask({
          id: "t1",
          title: "older task",
          created_at: daysBefore(8),
          updated_at: daysBefore(4),
        }),
      ],
      calendarBlocks: [
        makeBlock({
          id: "b1",
          created_at: daysBefore(7),
          updated_at: daysBefore(6),
        }),
      ],
    });

    expect(latestActivityTimestamp(state)).toBe(daysBefore(4));
  });
});

describe("buildWhileYouWereOutSummary", () => {
  it("returns an empty, zero-red summary for a pristine state", () => {
    const absence = detectAbsence({ lastActivityAt: null, now: NOW });
    const summary = buildWhileYouWereOutSummary({
      state: createInitialWorkflowState(),
      absence,
      now: NOW,
    });

    expect(summary.lapsedBlocks).toEqual([]);
    expect(summary.counts).toEqual({
      lapsedBlocks: 0,
      pendingTriage: 0,
      activeTasks: 0,
    });
    expect(summary.stalest).toBeNull();
  });

  it("enumerates only scheduled blocks that fully lapsed during the absence", () => {
    const lastActivity = daysBefore(6);
    const absence = detectAbsence({ lastActivityAt: lastActivity, now: NOW });
    const state = stateWith({
      tasks: [
        makeTask({ id: "t1", title: "Write report", status: "scheduled" }),
      ],
      calendarBlocks: [
        // Lapsed inside the absence window and still scheduled -> candidate.
        makeBlock({ id: "b-lapsed", task_id: "t1", end_at: daysBefore(3) }),
        // Ended before the absence began -> Flow 8 territory, not the batch.
        makeBlock({ id: "b-pre-absence", end_at: daysBefore(7) }),
        // Already handled (missed) -> not a candidate.
        makeBlock({ id: "b-missed", status: "missed", end_at: daysBefore(2) }),
        // Still in the future -> untouched.
        makeBlock({ id: "b-future", end_at: daysBefore(-1) }),
      ],
    });

    const summary = buildWhileYouWereOutSummary({ state, absence, now: NOW });

    expect(summary.lapsedBlocks.map((block) => block.blockId)).toEqual([
      "b-lapsed",
    ]);
    expect(summary.lapsedBlocks[0]).toMatchObject({
      taskId: "t1",
      taskTitle: "Write report",
    });
    expect(summary.counts.lapsedBlocks).toBe(1);
  });

  it("surfaces the single stalest open item across captures and tasks", () => {
    const absence = detectAbsence({ lastActivityAt: daysBefore(4), now: NOW });
    const state = stateWith({
      captureItems: [
        makeCapture({ id: "c-old", created_at: daysBefore(20) }),
        makeCapture({
          id: "c-resolved",
          status: "resolved",
          created_at: daysBefore(40),
        }),
      ],
      tasks: [
        makeTask({
          id: "t-newer",
          title: "Newer task",
          created_at: daysBefore(5),
        }),
        makeTask({
          id: "t-done",
          title: "Done task",
          status: "done",
          created_at: daysBefore(50),
        }),
      ],
    });

    const summary = buildWhileYouWereOutSummary({ state, absence, now: NOW });

    expect(summary.stalest).toMatchObject({
      kind: "capture",
      id: "c-old",
      ageDays: 20,
    });
    expect(summary.counts.pendingTriage).toBe(1);
    expect(summary.counts.activeTasks).toBe(1);
  });
});
