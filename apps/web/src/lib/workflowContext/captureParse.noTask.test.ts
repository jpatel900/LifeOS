import { describe, expect, it, vi } from "vitest";
import { createCaptureParseOps } from "./captureParse";
import { requestParseCapture } from "../ai/parseCaptureClient";
import { parseCaptureRegressionFixtures } from "../ai/fixtures/parseCaptureFixtures";
import { selectUnsortedCaptures } from "../workflow/captureStatus";
import {
  rawCaptureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import type { ParseCaptureResponse } from "@lifeos/schemas";

vi.mock("../ai/parseCaptureClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/parseCaptureClient")>()),
  requestParseCapture: vi.fn(),
}));

/**
 * Bug hunt #9 — a Sort that finds no task (a note, or only a project) showed
 * nothing: the thought either stayed silently, vanished until the next sync,
 * or (project only) Sort became a silent no-op.
 */
const simple = parseCaptureRegressionFixtures.simpleTask!;
const project = parseCaptureRegressionFixtures.ambiguousProject!;

const noteOnly: ParseCaptureResponse = {
  ...simple,
  triage_required: false,
  overall_confidence: 0.9,
  drafts: [],
};
const projectOnly: ParseCaptureResponse = {
  ...project,
  drafts: project.drafts.filter((draft) => draft.draft_type !== "task_draft"),
};

function harness() {
  const state = rawCaptureWorkflow(workflowSeed(), "A quote from the podcast");
  const capture = state.captureItems[0]!;
  const stateRef = { current: state };
  const setCaptureParse = vi.fn();
  const deps = {
    activeParseCaptureIdRef: { current: null as string | null },
    setCaptureParse,
    captureParse: { phase: "idle" as const },
    stateRef,
    persistedAreasRef: { current: [] },
    applyWorkflowState: vi.fn((next: typeof state) => {
      stateRef.current = next;
    }),
    persistCapture: vi.fn(),
    markDeviceStorageBlocked: vi.fn(),
    markPersistedSaveFailure: vi.fn(),
    refreshUnsyncedCount: vi.fn(),
  };
  return { capture, stateRef, setCaptureParse, deps };
}

function answer(response: ParseCaptureResponse) {
  vi.mocked(requestParseCapture).mockResolvedValue({
    ok: true,
    parser: "ai",
    status: "unknown",
    degraded: false,
    response,
  });
}

describe("a Sort that finds no task says so (bug hunt #9)", () => {
  it("keeps a note in 'not sorted yet' and explains", async () => {
    answer(noteOnly);
    const { capture, stateRef, setCaptureParse, deps } = harness();

    await createCaptureParseOps(deps).parseCaptureIntoDrafts(capture, "auto");

    expect(selectUnsortedCaptures(stateRef.current).map((c) => c.id)).toEqual([
      capture.id,
    ]);
    expect(setCaptureParse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "parsed",
        captureId: capture.id,
        warning: expect.stringContaining("didn't find a task"),
      }),
    );
  });

  it("names a project-only result and still lets Sort run again", async () => {
    answer(projectOnly);
    const { capture, stateRef, setCaptureParse, deps } = harness();

    await createCaptureParseOps(deps).parseCaptureIntoDrafts(capture, "auto");

    expect(setCaptureParse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "parsed",
        warning: expect.stringContaining("project"),
      }),
    );

    vi.mocked(requestParseCapture).mockClear();
    answer(projectOnly);
    const again = createCaptureParseOps({
      ...deps,
      captureParse: {
        phase: "parsed",
        captureId: capture.id,
        parser: "ai",
        status: "unknown",
      },
    });
    again.sortCaptureIntoDrafts(capture.id);
    await vi.waitFor(() => expect(requestParseCapture).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(
        stateRef.current.projectDrafts.filter(
          (draft) => draft.capture_item_id === capture.id,
        ),
      ).toHaveLength(1),
    );
  });
});
