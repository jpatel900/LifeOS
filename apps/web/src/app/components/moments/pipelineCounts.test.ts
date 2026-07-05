import { describe, expect, it } from "vitest";
import { createInitialWorkflowState, type WorkflowState } from "@/lib/workflow";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
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

/** Pinned clock convention shared with momentsViewModel.test.ts. */
const NOW = new Date("2026-07-05T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeArea(
  overrides: Partial<Phase2MockArea> & { id: string },
): Phase2MockArea {
  return {
    user_id: "user-1",
    name: `Area ${overrides.id}`,
    color: "#000000",
    created_at: daysBefore(100),
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
    created_at: daysBefore(1),
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
    created_at: daysBefore(1),
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
    start_at: NOW.toISOString(),
    end_at: NOW.toISOString(),
    status: "scheduled",
    created_at: daysBefore(1),
    updated_at: daysBefore(1),
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
    outcome: "completed",
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

describe("buildPipelineCounts — fixture-driven", () => {
  it("counts pending drafts, capture items, active tasks, planned blocks, and review items per stage", () => {
    const state = stateWith({
      captureItems: [
        makeCaptureItem({ id: "cap-1", status: "new" }),
        makeCaptureItem({ id: "cap-2", status: "triage_required" }),
      ],
      taskDrafts: [
        makeTaskDraft({ id: "draft-1", status: "pending" }),
        makeTaskDraft({ id: "draft-2", status: "accepted" }),
      ],
      tasks: [
        makeTask({ id: "task-1", title: "Active one", status: "active" }),
      ],
      calendarBlocks: [
        makeBlock({
          id: "block-1",
          status: "scheduled",
          task_id: "task-scheduled",
        }),
      ],
    });

    const counts = buildPipelineCounts(state, "area-1");

    expect(counts.capture).toBe(2);
    expect(counts.triage).toBe(1);
    expect(counts.plan).toBe(1);
    expect(counts.execute).toBe(0); // block references a task not in `tasks` with status scheduled
    // review = reviewQueue.length + sessions.length; reviewQueue includes
    // every "today" (active) task with reason "open" per buildCockpitViewModel.
    expect(counts.review).toBe(1);
  });

  it("returns only the five non-today pipeline stages", () => {
    expect(PIPELINE_OVERVIEW_STAGES).toEqual([
      "capture",
      "triage",
      "plan",
      "execute",
      "review",
    ]);
  });
});

describe("buildPipelineCounts — agreement with the real cockpit nav badges", () => {
  it("matches buildCockpitViewModel(...).counts for every pipeline stage", () => {
    const state = stateWith({
      areas: [makeArea({ id: "area-1" }), makeArea({ id: "area-2" })],
      captureItems: [
        makeCaptureItem({ id: "cap-1", area_id: "area-1", status: "new" }),
        makeCaptureItem({ id: "cap-2", area_id: "area-2", status: "new" }),
      ],
      taskDrafts: [
        makeTaskDraft({ id: "draft-1", area_id: "area-1", status: "pending" }),
      ],
      tasks: [
        makeTask({
          id: "task-1",
          title: "Active",
          area_id: "area-1",
          status: "active",
        }),
        makeTask({
          id: "task-2",
          title: "Scheduled",
          area_id: "area-1",
          status: "scheduled",
        }),
      ],
      calendarBlocks: [
        makeBlock({
          id: "block-1",
          area_id: "area-1",
          status: "scheduled",
          task_id: "task-2",
        }),
      ],
      executionSessions: [
        makeSession({ id: "session-1", area_id: "area-1", status: "stuck" }),
      ],
    });

    for (const areaId of ["area-1", "area-2", null]) {
      const ourCounts = buildPipelineCounts(state, areaId);
      const cockpitVM = buildCockpitViewModel(state, areaId, false);

      for (const stage of PIPELINE_OVERVIEW_STAGES) {
        expect(ourCounts[stage]).toBe(cockpitVM.counts[stage]);
      }
    }
  });
});
