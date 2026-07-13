import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
import type { Phase2CaptureItem, Phase2TaskDraft } from "@lifeos/schemas";
import {
  buildPipelineCounts,
  PIPELINE_OVERVIEW_STAGES,
} from "./pipelineCounts";

const NOW = new Date("2026-07-05T12:00:00.000Z");
const TODAY = "2026-07-05T09:00:00.000Z";
const YESTERDAY = "2026-07-04T09:00:00.000Z";

function makeArea(
  overrides: Partial<Phase2MockArea> & { id: string },
): Phase2MockArea {
  return {
    user_id: "user-1",
    name: `Area ${overrides.id}`,
    color: "#000000",
    created_at: YESTERDAY,
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
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
    ...overrides,
  } as Phase2MockTask;
}

function makeCaptureItem(
  overrides: Partial<Phase2CaptureItem> & { id: string },
): Phase2CaptureItem {
  return {
    user_id: "user-1",
    area_id: "area-1",
    raw_text: "Some capture",
    capture_mode: "text",
    inferred_area_confidence: null,
    status: "new",
    created_at: YESTERDAY,
    ...overrides,
  };
}

function makeTaskDraft(
  overrides: Partial<Phase2TaskDraft> & { id: string },
): Phase2TaskDraft {
  return {
    user_id: "user-1",
    capture_item_id: "capture-1",
    area_id: "area-1",
    title: "Draft task",
    description: null,
    confidence: 0.8,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    first_tiny_step: null,
    breakdown: null,
    person_mentions: [],
    is_commitment: false,
    status: "pending",
    created_at: YESTERDAY,
    ...overrides,
  };
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
    start_at: TODAY,
    end_at: "2026-07-05T10:00:00.000Z",
    status: "scheduled",
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
    ...overrides,
  } as Phase2MockCalendarBlock;
}

function makeSession(
  overrides: Partial<Phase2MockExecutionSession> & { id: string },
): Phase2MockExecutionSession {
  return {
    user_id: "user-1",
    area_id: "area-1",
    task_id: null,
    calendar_block_id: null,
    planned_minutes: null,
    actual_minutes: null,
    status: "running",
    outcome: "partial",
    ...overrides,
  };
}

function stateWith(partial: Partial<WorkflowState>): WorkflowState {
  return {
    ...createInitialWorkflowState(),
    areas: [makeArea({ id: "area-1" })],
    ...partial,
  };
}

describe("buildPipelineCounts", () => {
  it("returns only the five non-today pipeline stages", () => {
    expect(PIPELINE_OVERVIEW_STAGES).toEqual([
      "capture",
      "triage",
      "plan",
      "execute",
      "review",
    ]);
  });

  it("returns zero states when no stage has actionable work", () => {
    expect(buildPipelineCounts(stateWith({}), "area-1", { now: NOW })).toEqual({
      capture: 0,
      triage: 0,
      plan: 0,
      execute: 0,
      review: 0,
    });
  });

  it("counts only raw captures not yet parsed or dispatched", () => {
    const state = stateWith({
      captureItems: [
        makeCaptureItem({ id: "cap-new", status: "new" }),
        makeCaptureItem({ id: "cap-parsed", status: "parsed" }),
        makeCaptureItem({ id: "cap-triage", status: "triage_required" }),
        makeCaptureItem({ id: "cap-resolved", status: "resolved" }),
      ],
    });

    expect(buildPipelineCounts(state, "area-1", { now: NOW }).capture).toBe(1);
  });

  it("counts pending drafts and excludes accepted/rejected historical drafts", () => {
    const state = stateWith({
      taskDrafts: [
        makeTaskDraft({ id: "draft-pending", status: "pending" }),
        makeTaskDraft({ id: "draft-accepted", status: "accepted" }),
        makeTaskDraft({ id: "draft-rejected", status: "rejected" }),
      ],
    });

    expect(buildPipelineCounts(state, "area-1", { now: NOW }).triage).toBe(1);
  });

  it("counts do-today tasks that do not have an open block today", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "task-unplaced", title: "Unplaced" }),
        makeTask({ id: "task-placed", title: "Placed" }),
        makeTask({ id: "task-backlog", title: "Backlog", status: "backlog" }),
      ],
      calendarBlocks: [
        makeBlock({ id: "block-today", task_id: "task-placed" }),
      ],
    });

    expect(buildPipelineCounts(state, "area-1", { now: NOW }).plan).toBe(1);
  });

  it("counts planned-but-unstarted blocks today and excludes historical or started blocks", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({ id: "block-scheduled-today", task_id: "task-1" }),
        makeBlock({
          id: "block-scheduled-yesterday",
          task_id: "task-2",
          start_at: YESTERDAY,
        }),
        makeBlock({
          id: "block-running-today",
          task_id: "task-3",
          status: "running",
        }),
        makeBlock({
          id: "block-completed-today",
          task_id: "task-4",
          status: "completed",
        }),
      ],
    });

    expect(buildPipelineCounts(state, "area-1", { now: NOW }).execute).toBe(1);
  });

  it("counts today's sessions awaiting review and excludes historical sessions", () => {
    const state = stateWith({
      calendarBlocks: [
        makeBlock({
          id: "block-today",
          task_id: "task-1",
          status: "completed",
        }),
        makeBlock({
          id: "block-yesterday",
          task_id: "task-2",
          status: "completed",
          start_at: YESTERDAY,
        }),
      ],
      executionSessions: [
        makeSession({
          id: "session-today",
          calendar_block_id: "block-today",
          status: "completed",
        }),
        makeSession({
          id: "session-yesterday",
          calendar_block_id: "block-yesterday",
          status: "completed",
        }),
        makeSession({
          id: "session-running",
          calendar_block_id: "block-today",
          status: "running",
        }),
      ],
    });

    expect(buildPipelineCounts(state, "area-1", { now: NOW }).review).toBe(1);
  });
});
