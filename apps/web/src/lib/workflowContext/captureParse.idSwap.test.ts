import { describe, expect, it, vi } from "vitest";
import { createCaptureParseOps } from "./captureParse";
import { requestParseCapture } from "../ai/parseCaptureClient";
import { parseCaptureRegressionFixtures } from "../ai/fixtures/parseCaptureFixtures";
import { workflowReducer, type PersistedWorkflowPayload } from "./reducerCore";
import { submitRawCapture } from "../workflow";
import { workflowSeed } from "@/__tests__/helpers/workflowReachability";

vi.mock("../ai/parseCaptureClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/parseCaptureClient")>()),
  requestParseCapture: vi.fn(),
}));

/**
 * #1091 follow-up: sync can swap a capture's device id for its account id
 * while Sort is running. The "Sorting…"/result state must follow the swap,
 * or it points at a row that no longer exists.
 */
const ACCOUNT_CAPTURE_ID = "55555555-5555-4555-8555-555555555555";

type SeededState = ReturnType<typeof workflowSeed>;

function swapCaptureId(state: SeededState, localId: string) {
  const local = state.captureItems.find((item) => item.id === localId)!;
  const payload: PersistedWorkflowPayload = {
    captures: [{ ...local, id: ACCOUNT_CAPTURE_ID, status: "new" }],
    tasks: [],
    proposals: [],
    blocks: [],
    sessions: [],
    reviewLog: [],
    idAliases: {
      captures: new Map([[localId, ACCOUNT_CAPTURE_ID]]),
      tasks: new Map(),
      proposals: new Map(),
      blocks: new Map(),
      sessions: new Map(),
    },
  };
  const recorded = workflowReducer(state, {
    type: "recordAccountId",
    family: "captures",
    localId,
    accountId: ACCOUNT_CAPTURE_ID,
  });
  return workflowReducer(recorded, { type: "syncPersistedWorkflow", payload });
}

function harness() {
  const state = submitRawCapture(workflowSeed(), {
    rawText: "Renew the insurance",
    areaId: "area-main-job",
  });
  const capture = state.captureItems[0]!;
  const stateRef = { current: state };
  const setCaptureParse = vi.fn();
  const deps = {
    activeParseCaptureIdRef: { current: null as string | null },
    setCaptureParse,
    captureParse: { phase: "idle" as const },
    stateRef,
    persistedAreasRef: { current: [] },
    applyWorkflowState: vi.fn((next: SeededState) => {
      stateRef.current = next;
    }),
    persistCapture: vi.fn(),
    markDeviceStorageBlocked: vi.fn(),
    markPersistedSaveFailure: vi.fn(),
    refreshUnsyncedCount: vi.fn(),
  };
  return { capture, stateRef, setCaptureParse, deps };
}

describe("Sort state follows the capture id swap (#1091 follow-up)", () => {
  it("settles on the account id when sync swaps the capture mid-sort", async () => {
    let answer: (
      value: Awaited<ReturnType<typeof requestParseCapture>>,
    ) => void = () => {};
    vi.mocked(requestParseCapture).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { capture, stateRef, setCaptureParse, deps } = harness();

    const sorting = createCaptureParseOps(deps).parseCaptureIntoDrafts(
      capture,
      "auto",
    );
    await vi.waitFor(() => expect(requestParseCapture).toHaveBeenCalled());
    expect(setCaptureParse).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "parsing", captureId: capture.id }),
    );

    // Sync lands while the request is out: the device row is retired.
    stateRef.current = swapCaptureId(stateRef.current, capture.id);
    expect(stateRef.current.captureItems.map((item) => item.id)).toEqual([
      ACCOUNT_CAPTURE_ID,
    ]);

    answer({
      ok: true,
      parser: "ai",
      status: "unknown",
      degraded: false,
      response: parseCaptureRegressionFixtures.simpleTask!,
    });
    await sorting;

    expect(setCaptureParse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: "parsed",
        captureId: ACCOUNT_CAPTURE_ID,
      }),
    );
    for (const draft of stateRef.current.taskDrafts) {
      expect(draft.capture_item_id).toBe(ACCOUNT_CAPTURE_ID);
    }
  });

  it("a failure recorded under the device id retries the account capture", async () => {
    vi.mocked(requestParseCapture).mockReset();
    vi.mocked(requestParseCapture).mockResolvedValue({
      ok: true,
      parser: "mock",
      status: "unknown",
      degraded: false,
      response: parseCaptureRegressionFixtures.simpleTask!,
    });
    const { capture, stateRef, setCaptureParse, deps } = harness();
    stateRef.current = swapCaptureId(stateRef.current, capture.id);

    createCaptureParseOps({
      ...deps,
      captureParse: {
        phase: "failed",
        captureId: capture.id,
        status: "unknown",
        message: "Synthetic failure",
        canRetryWithMock: true,
      },
    }).retryCaptureParseWithMock();

    await vi.waitFor(() => expect(requestParseCapture).toHaveBeenCalled());
    expect(setCaptureParse).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "parsing",
        captureId: ACCOUNT_CAPTURE_ID,
      }),
    );
  });
});
