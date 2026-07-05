import { describe, expect, it, vi } from "vitest";
import { MOCK_USER_ID } from "@/lib/mockData";
import {
  acceptProjectDraft,
  acceptDraft,
  acceptProposal,
  backlogDraft,
  createLocalProposalFromTask,
  createInitialWorkflowState,
  editDraft,
  planTaskAtHour,
  markCurrentSession,
  mergeDrafts,
  promoteBacklogTask,
  mockParseCapture,
  rejectPersonMention,
  rejectProposal,
  splitDraft,
  startExecutionSession,
  submitCapture,
  swapWipSlot,
  WIP_ENFORCEMENT_LIMIT,
  WIP_ENFORCEMENT_POLICY_ID,
  unplanTask,
  updateProposal,
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

  it("edits and reassigns a pending triage draft", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Clean up the volunteer follow-up.",
      areaId: "area-volunteer",
    });
    const draftId = state.taskDrafts[0].id;
    state = editDraft(state, draftId, {
      title: "Send the sponsor follow-up",
      area_id: "area-main-job",
      first_tiny_step: "Open the sponsor notes",
    });

    expect(state.taskDrafts[0]).toMatchObject({
      title: "Send the sponsor follow-up",
      area_id: "area-main-job",
      first_tiny_step: "Open the sponsor notes",
    });
    expect(state.timeBlockProposalDrafts[0].area_id).toBe("area-main-job");
  });

  it("degrades a rejected person link to a plain task without losing the draft", () => {
    let state = createInitialWorkflowState();
    state = submitCapture(state, {
      rawText: "Send Sarah the deck like I promised.",
      areaId: "area-main-job",
    });
    const draftId = state.taskDrafts[0].id;

    // Simulate the AI proposing a commitment + person link on the draft.
    state = {
      ...state,
      taskDrafts: state.taskDrafts.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              is_commitment: true,
              person_mentions: [
                { name: "Sarah", role: "committed_to", confidence: 0.9 },
              ],
            }
          : draft,
      ),
    };

    state = rejectPersonMention(state, draftId, 0);

    const draft = state.taskDrafts.find((item) => item.id === draftId);
    // The draft survives (NS-INV-4) as a plain task; mention + commitment gone.
    expect(draft).toBeDefined();
    expect(draft?.person_mentions).toEqual([]);
    expect(draft?.is_commitment).toBe(false);
    expect(draft?.status).toBe("pending");
  });

  it("keeps is_commitment true when another committed_to mention remains", () => {
    let state = createInitialWorkflowState();
    state = submitCapture(state, {
      rawText: "Promised both Sarah and Alex the updated deck.",
      areaId: "area-main-job",
    });
    const draftId = state.taskDrafts[0].id;
    state = {
      ...state,
      taskDrafts: state.taskDrafts.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              is_commitment: true,
              person_mentions: [
                { name: "Sarah", role: "committed_to", confidence: 0.9 },
                { name: "Alex", role: "committed_to", confidence: 0.85 },
              ],
            }
          : draft,
      ),
    };

    state = rejectPersonMention(state, draftId, 0);

    const draft = state.taskDrafts.find((item) => item.id === draftId);
    expect(draft?.person_mentions).toHaveLength(1);
    expect(draft?.is_commitment).toBe(true);
  });

  it("honors is_commitment on the accepted local task and degrades person-id links to null", () => {
    let state = createInitialWorkflowState();
    state = submitCapture(state, {
      rawText: "Send Sarah the deck like I promised.",
      areaId: "area-main-job",
    });
    const draftId = state.taskDrafts[0].id;
    state = {
      ...state,
      taskDrafts: state.taskDrafts.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              is_commitment: true,
              person_mentions: [
                { name: "Sarah", role: "committed_to", confidence: 0.9 },
              ],
            }
          : draft,
      ),
    };

    state = acceptDraft(state, draftId);

    const task = state.tasks[0];
    // The person-less commitment flag survives locally; the local demo path has
    // no people store, so the person-id FKs degrade to null (no-link).
    expect(task?.is_commitment).toBe(true);
    expect(task?.waiting_on_person_id).toBeNull();
    expect(task?.committed_to_person_id).toBeNull();
    expect(task?.waiting_on_since).toBeNull();
  });

  it("leaves a plain accepted local task as a non-commitment with no person links", () => {
    let state = createInitialWorkflowState();
    state = submitCapture(state, {
      rawText: "Draft agenda for tomorrow's project check-in.",
      areaId: "area-main-job",
    });
    state = acceptDraft(state, state.taskDrafts[0].id);

    const task = state.tasks[0];
    expect(task?.is_commitment).toBe(false);
    expect(task?.waiting_on_person_id).toBeNull();
    expect(task?.committed_to_person_id).toBeNull();
  });

  it("splits and merges pending triage drafts locally", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Plan travel and confirm tickets.",
      areaId: "area-personal",
    });
    const originalDraftId = state.taskDrafts[0].id;
    state = splitDraft(state, originalDraftId, [
      "Plan travel",
      "Confirm tickets",
    ]);

    expect(state.taskDrafts[0].title).toBe("Plan travel");
    expect(state.taskDrafts[1].title).toBe("Confirm tickets");
    expect(
      state.taskDrafts.find((draft) => draft.id === originalDraftId)?.status,
    ).toBe("rejected");

    state = mergeDrafts(state, state.taskDrafts[0].id, state.taskDrafts[1].id);

    expect(state.taskDrafts[0].title).toBe("Plan travel; Confirm tickets");
    expect(state.taskDrafts[1].status).toBe("rejected");
  });

  it("creates, edits, accepts, and rejects local proposals without external writes", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Prepare the plan proposal parity proof.",
      areaId: "area-main-job",
    });
    state = acceptDraft(state, state.taskDrafts[0].id);
    state = createLocalProposalFromTask(state, state.tasks[0].id, {
      proposed_start: "2026-06-30T14:00:00.000Z",
      proposed_end: "2026-06-30T14:45:00.000Z",
      rationale: "Manual local proposal proof.",
    });

    const proposalId = state.timeBlockProposals[0].id;
    state = updateProposal(state, proposalId, {
      proposed_start: "2026-06-30T15:00:00.000Z",
      proposed_end: "2026-06-30T15:45:00.000Z",
      rationale: "Moved locally.",
    });

    expect(state.timeBlockProposals[0]).toMatchObject({
      status: "edited",
      rationale: "Moved locally.",
    });

    const editedState = state;
    const acceptedState = acceptProposal(editedState, proposalId);
    expect(acceptedState.tasks[0].status).toBe("scheduled");
    expect(acceptedState.calendarBlocks[0].task_id).toBe(
      acceptedState.tasks[0].id,
    );

    state = rejectProposal(editedState, proposalId);
    expect(state.timeBlockProposals[0].status).toBe("rejected");
  });

  it("refuses the fourth accept-to-today item and supports one-click swap", () => {
    let state = createInitialWorkflowState();

    for (const title of [
      "First active item",
      "Second active item",
      "Third active item",
    ]) {
      state = submitCapture(state, { rawText: title, areaId: "area-main-job" });
      state = acceptDraft(state, state.taskDrafts[0].id);
    }

    state = submitCapture(state, {
      rawText: "Fourth active item",
      areaId: "area-main-job",
    });
    const refusedDraftId = state.taskDrafts[0].id;
    const refused = acceptDraft(state, refusedDraftId);

    expect(
      refused.tasks.filter((task) => task.status === "active"),
    ).toHaveLength(WIP_ENFORCEMENT_LIMIT);
    expect(refused.wipRefusal?.policy_id).toBe(WIP_ENFORCEMENT_POLICY_ID);
    expect(refused.wipRefusal?.activation_path).toBe("triage_accept_to_today");
    expect(refused.wipRefusal?.slot_holders).toHaveLength(
      WIP_ENFORCEMENT_LIMIT,
    );
    expect(
      refused.taskDrafts.find((draft) => draft.id === refusedDraftId)?.status,
    ).toBe("pending");

    const releasedTaskId = refused.wipRefusal!.slot_holders[0].task_id;
    const swapped = swapWipSlot(refused, releasedTaskId);

    expect(swapped.wipRefusal).toBeNull();
    expect(
      swapped.tasks.find((task) => task.id === releasedTaskId)?.status,
    ).toBe("backlog");
    expect(
      swapped.tasks.some((task) => task.title === "Fourth active item"),
    ).toBe(true);
  });

  it("refuses planning a fourth committed item and exposes slot holders", () => {
    let state = createInitialWorkflowState();

    for (const title of [
      "First plan item",
      "Second plan item",
      "Third plan item",
    ]) {
      state = submitCapture(state, { rawText: title, areaId: "area-main-job" });
      state = acceptDraft(state, state.taskDrafts[0].id);
    }

    state = submitCapture(state, {
      rawText: "Fourth plan item",
      areaId: "area-main-job",
    });
    state = backlogDraft(state, state.taskDrafts[0].id);
    state = promoteBacklogTask(state, state.tasks[0].id);

    expect(state.wipRefusal?.activation_path).toBe("triage_accept_to_today");
    expect(
      state.wipRefusal?.slot_holders.map((holder) => holder.title),
    ).toEqual(["Third plan item", "Second plan item", "First plan item"]);
  });

  it("uses elapsed minutes when marking an execution session complete", () => {
    let state = createInitialWorkflowState();

    state = submitCapture(state, {
      rawText: "Finish actual duration proof.",
      areaId: "area-main-job",
    });
    state = acceptDraft(state, state.taskDrafts[0].id);
    state = planTaskAtHour(state, state.tasks[0].id, 10);
    state = startExecutionSession(state, state.tasks[0].id);
    state = markCurrentSession(state, "completed", { actualMinutes: 7 });

    expect(state.executionSessions[0].actual_minutes).toBe(7);
    expect(state.tasks[0].status).toBe("done");
    expect(state.calendarBlocks[0].status).toBe("completed");
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
