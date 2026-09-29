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
    const projectResponse = {
      ...parseCaptureRegressionFixtures.ambiguousProject,
      drafts: parseCaptureRegressionFixtures.ambiguousProject.drafts.map(
        (draft) => ({
          ...draft,
          area_slug_suggestion: "garden-planning",
        }),
      ),
    };
    expect(
      buildParsedWorkflowResult({
        response: projectResponse,
        capture,
        workflowAreaId: null,
        areas: [customArea],
      }).projectDrafts[0]?.area_id,
    ).toBe(customArea.id);
  });

  it("uses only real area IDs when the caller supplies current areas", () => {
    const volunteerArea = { id: "area-volunteer", name: "Volunteer Work" };
    const input = { capture, areas: [customArea] };
    expect(
      buildParsedWorkflowResult({
        ...input,
        response: responseWithSlug("main-job"),
        workflowAreaId: null,
      }).taskDrafts[0]?.area_id,
    ).toBe(customArea.id);
    expect(
      buildParsedWorkflowResult({
        ...input,
        response: responseWithSlug("unknown-area"),
        workflowAreaId: customArea.id,
      }).taskDrafts[0]?.area_id,
    ).toBe(customArea.id);
    expect(
      buildParsedWorkflowResult({
        ...input,
        response: responseWithSlug("volunteer-work"),
        workflowAreaId: null,
        areas: [customArea, volunteerArea],
      }).taskDrafts[0]?.area_id,
    ).toBe(volunteerArea.id);
    expect(
      buildParsedWorkflowResult({
        response: responseWithSlug("volunteer-work"),
        capture,
        workflowAreaId: customArea.id,
        areas: [customArea, volunteerArea],
      }).taskDrafts[0]?.area_id,
    ).toBe(volunteerArea.id);
    expect(
      buildParsedWorkflowResult({
        response: responseWithSlug("volunteer-work"),
        capture,
        workflowAreaId: customArea.id,
        areas: [customArea, { id: "other-custom-id", name: "Volunteer Work" }],
      }).taskDrafts[0]?.area_id,
    ).toBe("other-custom-id");
    expect(
      buildParsedWorkflowResult({
        response: responseWithSlug("garden-planning"),
        capture,
        workflowAreaId: "other-custom-id",
        areas: [customArea, { id: "other-custom-id", name: "Home Admin" }],
      }).taskDrafts[0]?.area_id,
    ).toBe("other-custom-id");
  });

  it("keeps starter mapping for legacy callers without an area inventory", () => {
    expect(
      buildParsedWorkflowResult({
        response: responseWithSlug("volunteer-work"),
        capture,
        workflowAreaId: null,
      }).taskDrafts[0]?.area_id,
    ).toBe("area-volunteer");
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
  it("refuses Sort with an empty area inventory and retains the raw capture", async () => {
    const state = createInitialWorkflowState();
    state.areas = [];
    state.captureItems.push(capture);
    const stateRef = { current: state };
    const setCaptureParse = vi.fn();
    const applyWorkflowState = vi.fn();
    vi.mocked(requestParseCapture).mockClear();
    const ops = createCaptureParseOps({
      activeParseCaptureIdRef: { current: null },
      setCaptureParse,
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
    expect(requestParseCapture).not.toHaveBeenCalled();
    expect(applyWorkflowState).not.toHaveBeenCalled();
    expect(stateRef.current.captureItems).toContain(capture);
    expect(stateRef.current.taskDrafts).toHaveLength(0);
    expect(setCaptureParse).toHaveBeenLastCalledWith({
      phase: "failed",
      captureId: capture.id,
      status: "unknown",
      message: "Add an area before sorting. Your thought remains in Capture.",
      canRetryWithMock: false,
    });
  });
});
