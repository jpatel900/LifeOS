import { describe, expect, it, vi } from "vitest";
import { MOCK_USER_ID } from "@/lib/mockData";
import {
  acceptProjectDraft,
  acceptDraft,
  backlogDraft,
  createInitialWorkflowState,
  planTaskAtHour,
  promoteBacklogTask,
  mockParseCapture,
  submitCapture,
  unplanTask,
} from "@/lib/workflow";

describe("local mock workflow", () => {
  it("parses messy capture text into a schema-validated draft bundle", () => {
    const parsed = mockParseCapture({
      rawText: "Need to follow up with Alex about volunteer event sponsorship.",
      areaId: "area-volunteer",
    });

    expect(parsed.captureItem.raw_text).toContain("follow up with Alex");
    expect(parsed.captureItem.status).toBe("triage_required");
    expect(parsed.taskDraft.title).toContain("follow up with Alex");
    expect(parsed.taskDraft.status).toBe("pending");
    expect(parsed.ambiguityAssessment.recommended_first_move).toBeTruthy();
    expect(parsed.timeBlockProposalDraft.status).toBe("draft");
  });

  it("moves capture through triage into an accepted task with a local proposal", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Draft agenda for tomorrow's project check-in.",
      areaId: "area-main-job",
    });

    expect(state.captureItems).toHaveLength(1);
    expect(state.taskDrafts).toHaveLength(1);
    expect(state.timeBlockProposalDrafts).toHaveLength(1);

    state = acceptDraft(state, state.taskDrafts[0].id);

    expect(state.taskDrafts[0].status).toBe("accepted");
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe("active");
    expect(state.timeBlockProposals).toHaveLength(1);
    expect(state.timeBlockProposals[0].task_id).toBe(state.tasks[0].id);
    expect(state.timeBlockProposals[0].status).toBe("proposed");
  });

  it("moves a triage draft into backlog and can promote it later", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Someday review old notes.",
      areaId: "area-main-job",
    });
    state = backlogDraft(state, state.taskDrafts[0].id);

    expect(state.tasks[0].status).toBe("backlog");
    expect(state.timeBlockProposals).toHaveLength(0);

    state = promoteBacklogTask(state, state.tasks[0].id);
    expect(state.tasks[0].status).toBe("active");
  });

  it("plans and unplans an active task on the local hour rail", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Draft agenda for tomorrow's project check-in.",
      areaId: "area-main-job",
    });
    state = acceptDraft(state, state.taskDrafts[0].id);
    state = planTaskAtHour(state, state.tasks[0].id, 10);

    expect(state.tasks[0].status).toBe("scheduled");
    expect(state.calendarBlocks[0].status).toBe("scheduled");
    expect(new Date(state.calendarBlocks[0].start_at).getHours()).toBe(10);

    state = unplanTask(state, state.calendarBlocks[0].id);
    expect(state.tasks[0].status).toBe("active");
    expect(state.calendarBlocks[0].status).toBe("cancelled");
  });

  it("moves a project-like capture through triage into an accepted project", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Need a project to organize volunteer ops system.",
      areaId: "area-volunteer",
    });

    expect(state.projectDrafts).toHaveLength(1);

    state = acceptProjectDraft(state, state.projectDrafts[0].id);

    expect(state.projectDrafts[0].status).toBe("accepted");
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0].title).toBe("organize volunteer ops system");
    expect(state.projects[0].status).toBe("active");
  });

  it("does not create a project draft for simple task-like captures", () => {
    const parsed = mockParseCapture({
      rawText: "Call dentist tomorrow.",
      areaId: "area-personal",
    });

    expect(parsed.projectDraft).toBeNull();
  });

  it("does not reuse numeric suffixes after syncing from restored state", async () => {
    vi.resetModules();
    const wf = await import("@/lib/workflow");
    const base = wf.createInitialWorkflowState();
    base.captureItems = [
      {
        id: "capture-5",
        user_id: MOCK_USER_ID,
        area_id: "area-main-job",
        raw_text: "prior session",
        capture_mode: "text",
        inferred_area_confidence: 0.5,
        status: "triage_required",
        created_at: new Date().toISOString(),
      },
    ];
    wf.syncWorkflowIdCounterFromState(base);
    const next = wf.submitCapture(base, {
      rawText: "New capture after reload.",
      areaId: "area-main-job",
    });
    expect(next.captureItems[0].id).toBe("capture-6");
  });
});
