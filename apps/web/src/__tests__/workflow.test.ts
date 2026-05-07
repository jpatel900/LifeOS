import { describe, expect, it, vi } from "vitest";
import {
  acceptDraft,
  createInitialWorkflowState,
  mockParseCapture,
  submitCapture,
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

  it("does not reuse generated IDs after a persisted session is reloaded", async () => {
    vi.resetModules();
    const firstModule = await import("@/lib/workflow");
    let persistedState = firstModule.submitCapture(
      firstModule.createInitialWorkflowState(),
      {
        rawText: "Draft the first capture before reload.",
        areaId: "area-main-job",
      },
    );

    vi.resetModules();
    const reloadedModule = await import("@/lib/workflow");
    persistedState = reloadedModule.submitCapture(persistedState, {
      rawText: "Draft the second capture after reload.",
      areaId: "area-main-job",
    });

    const captureIds = persistedState.captureItems.map((capture) => capture.id);
    const draftIds = persistedState.taskDrafts.map((draft) => draft.id);
    const proposalDraftIds = persistedState.timeBlockProposalDrafts.map(
      (proposal) => proposal.id,
    );

    expect(new Set(captureIds).size).toBe(captureIds.length);
    expect(new Set(draftIds).size).toBe(draftIds.length);
    expect(new Set(proposalDraftIds).size).toBe(proposalDraftIds.length);
  });
});

