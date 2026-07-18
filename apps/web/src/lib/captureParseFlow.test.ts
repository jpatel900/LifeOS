import { describe, expect, it } from "vitest";
import { ParseCaptureResponseSchema } from "@lifeos/schemas";
import { postParseCaptureAuthenticated } from "@/__tests__/helpers/parseCaptureFetch";
import { buildParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";
import {
  acceptDraft,
  appendParsedWorkflowResult,
  createInitialWorkflowState,
  submitRawCapture,
} from "@/lib/workflow";

/**
 * End-to-end capture journey through the real route handler, parser service
 * (mock mode), and real workflow transitions: raw capture saved first, then
 * POST /api/parse-capture, then validated drafts staged for triage.
 */
describe("cockpit capture → parse → draft journey", () => {
  it("saves the raw capture first, parses through the real route, and stages validated drafts", async () => {
    let state = createInitialWorkflowState();

    state = submitRawCapture(state, {
      rawText: "Need to renew my passport before the trip",
      areaId: "area-personal",
    });
    const capture = state.captureItems[0];
    if (!capture) throw new Error("Raw capture was not staged.");

    // Raw-save-first: the capture exists before any parse attempt, with no drafts yet.
    expect(capture.status).toBe("new");
    expect(capture.raw_text).toBe("Need to renew my passport before the trip");
    expect(state.taskDrafts).toHaveLength(0);

    // HIGH-1 (#670): the route requires a verified bearer token, so the
    // journey runs as an authenticated caller (the only supported posture).
    const httpResponse = await postParseCaptureAuthenticated({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: capture.raw_text,
        parserMode: "mock",
      }),
    });
    expect(httpResponse.status).toBe(200);
    const body = await httpResponse.json();
    expect(body.ok).toBe(true);
    expect(body.parser).toBe("mock");

    // Validate before staging, then map into triage drafts.
    const response = ParseCaptureResponseSchema.parse(body.response);
    const parsed = buildParsedWorkflowResult({
      response,
      capture,
      workflowAreaId: capture.area_id,
    });

    // The anti-procrastination breakdown passes through untouched.
    const responseTaskDraft = response.drafts.find(
      (draft) => draft.draft_type === "task_draft",
    );
    expect(responseTaskDraft?.breakdown).not.toBeNull();
    expect(parsed.taskDrafts[0]?.breakdown).toEqual(
      responseTaskDraft?.breakdown,
    );

    state = appendParsedWorkflowResult(state, parsed);

    // The existing raw capture is updated in place, never duplicated or lost.
    expect(
      state.captureItems.filter((item) => item.id === capture.id),
    ).toHaveLength(1);
    expect(state.captureItems[0]?.status).toBe("triage_required");

    const draft = state.taskDrafts[0];
    if (!draft) throw new Error("Parsed task draft was not staged.");
    expect(draft.status).toBe("pending");
    expect(draft.capture_item_id).toBe(capture.id);

    // A local focus-block proposal draft is scaffolded for the task draft.
    expect(
      state.timeBlockProposalDrafts.some(
        (proposal) => proposal.task_draft_id === draft.id,
      ),
    ).toBe(true);

    // Triage acceptance turns the staged draft into an active task with a plan proposal.
    state = acceptDraft(state, draft.id);
    const task = state.tasks.find(
      (item) => item.source_capture_item_id === capture.id,
    );
    expect(task?.status).toBe("active");
    expect(task?.title).toBe(draft.title);
    expect(
      state.timeBlockProposals.some(
        (proposal) => proposal.task_id === task?.id,
      ),
    ).toBe(true);
  });
});
