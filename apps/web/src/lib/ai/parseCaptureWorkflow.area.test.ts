import { describe, expect, it, vi } from "vitest";
import { buildParsedWorkflowResult } from "./parseCaptureWorkflow";
import { parseCaptureRegressionFixtures } from "./fixtures/parseCaptureFixtures";
import { createCaptureParseOps } from "../workflowContext/captureParse";
import { requestParseCapture } from "./parseCaptureClient";
import { createInitialWorkflowState } from "../workflow";

vi.mock("./parseCaptureClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./parseCaptureClient")>()),
  requestParseCapture: vi.fn(),
}));

const customArea = {
  id: "custom-area-id",
  user_id: "test-user",
  name: "Garden Planning",
  color: "#168a65",
  created_at: "2026-01-01T00:00:00.000Z",
};
const capture = {
  id: "capture-id",
  user_id: "test-user",
  raw_text: "Plan the garden",
  return_hook: null,
  created_at: "2026-01-01T00:00:00.000Z",
  area_id: null,
  status: "new" as const,
  capture_mode: "text" as const,
  inferred_area_confidence: null,
};
const responseWithSlug = (slug: string | null) => ({
  ...parseCaptureRegressionFixtures.simpleTask,
  drafts: parseCaptureRegressionFixtures.simpleTask.drafts.map((draft) => ({
    ...draft,
    area_slug_suggestion: slug,
  })),
});

describe("capture draft area mapping", () => {
  it("resolves an unscoped custom-area suggestion to its existing ID", () => {
    const parsed = buildParsedWorkflowResult({
      response: responseWithSlug("garden-planning"),
      capture,
      workflowAreaId: null,
      areas: [customArea],
    });
    expect(parsed.taskDrafts[0]?.area_id).toBe(customArea.id);
    expect(parsed.timeBlockProposalDrafts[0]?.area_id).toBe(customArea.id);
  });

  it("keeps explicit scope, starter suggestions, and unknown-slug fallback", () => {
    const input = { capture, areas: [customArea] };
    expect(
      buildParsedWorkflowResult({
        ...input,
        response: responseWithSlug("garden-planning"),
        workflowAreaId: "area-personal",
      }).taskDrafts[0]?.area_id,
    ).toBe("area-personal");
    expect(
      buildParsedWorkflowResult({
        ...input,
        response: responseWithSlug("volunteer-work"),
        workflowAreaId: null,
      }).taskDrafts[0]?.area_id,
    ).toBe("area-volunteer");
    expect(
      buildParsedWorkflowResult({
        ...input,
        response: responseWithSlug("unknown-area"),
        workflowAreaId: null,
      }).taskDrafts[0]?.area_id,
    ).toBe("area-main-job");
  });

  it("passes current custom areas through the real Sort caller", async () => {
    vi.mocked(requestParseCapture).mockResolvedValue({
      ok: true,
      parser: "mock",
      status: "mock",
      degraded: false,
      response: responseWithSlug("garden-planning"),
    });
    const state = createInitialWorkflowState();
    state.areas.push(customArea);
    state.captureItems.push(capture);
    const stateRef = { current: state };
    const activeParseCaptureIdRef = { current: null as string | null };
    const applyWorkflowState = vi.fn(
      (next: ReturnType<typeof createInitialWorkflowState>) => {
        stateRef.current = next;
      },
    );
    const ops = createCaptureParseOps({
      activeParseCaptureIdRef,
      setCaptureParse: vi.fn(),
      captureParse: { phase: "idle" },
      stateRef,
      persistedAreasRef: { current: [] },
      applyWorkflowState,
      persistCapture: vi.fn(),
      markLocalOnly: vi.fn(),
      markPersistedSaveFailure: vi.fn(),
      refreshUnsyncedCount: vi.fn(),
    });
    await ops.parseCaptureIntoDrafts(capture, "mock");
    expect(stateRef.current.taskDrafts[0]?.area_id).toBe(customArea.id);
  });
});
