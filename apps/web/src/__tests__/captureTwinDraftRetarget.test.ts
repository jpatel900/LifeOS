import { describe, expect, it } from "vitest";
import {
  workflowReducer,
  type PersistedWorkflowPayload,
} from "@/lib/workflowContext/reducerCore";
import { selectUnsortedCaptures } from "@/lib/workflow/captureStatus";
import { appendParsedWorkflowResult, submitRawCapture } from "@/lib/workflow";
import { buildParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";
import { captureWorkflow, workflowSeed } from "./helpers/workflowReachability";
import { parseCaptureRegressionFixtures } from "@/lib/ai/fixtures/parseCaptureFixtures";

/**
 * Bug hunt #6 — sync swaps a capture's device id for its account id and
 * retires the device row. Drafts made from it still pointed at the device
 * id, so the same thought showed BOTH as a pending draft and as "Captured,
 * not sorted yet" (Sort enabled, duplicates on re-sort), and in a new tab
 * the accept could not name its source capture.
 */
const ACCOUNT_CAPTURE_ID = "44444444-4444-4444-8444-444444444444";

function aliases(
  captures: Map<string, string>,
): PersistedWorkflowPayload["idAliases"] {
  return {
    captures,
    tasks: new Map(),
    proposals: new Map(),
    blocks: new Map(),
    sessions: new Map(),
  };
}

function payload(
  overrides: Partial<PersistedWorkflowPayload>,
): PersistedWorkflowPayload {
  return {
    captures: [],
    tasks: [],
    proposals: [],
    blocks: [],
    sessions: [],
    reviewLog: [],
    idAliases: aliases(new Map()),
    ...overrides,
  };
}

describe("drafts follow their capture to its account id (bug hunt #6)", () => {
  it("re-points pending drafts when sync retires the device capture", () => {
    const state = captureWorkflow(workflowSeed(), "Renew the insurance");
    const local = state.captureItems[0]!;
    expect(state.taskDrafts.some((d) => d.capture_item_id === local.id)).toBe(
      true,
    );

    const synced = workflowReducer(state, {
      type: "syncPersistedWorkflow",
      payload: payload({
        captures: [{ ...local, id: ACCOUNT_CAPTURE_ID, status: "new" }],
        idAliases: aliases(new Map([[local.id, ACCOUNT_CAPTURE_ID]])),
      }),
    });

    expect(synced.captureItems.map((c) => c.id)).toEqual([ACCOUNT_CAPTURE_ID]);
    // One truth: sorted, so not listed as "not sorted yet".
    expect(selectUnsortedCaptures(synced)).toEqual([]);
    for (const draft of synced.taskDrafts) {
      expect(draft.capture_item_id).toBe(ACCOUNT_CAPTURE_ID);
    }
  });

  it("files a sort that lands after the swap under the account capture, without re-adding the device row", () => {
    const raw = submitRawCapture(workflowSeed(), {
      rawText: "Renew the insurance",
      areaId: "area-main-job",
    });
    const local = raw.captureItems[0]!;
    const synced = workflowReducer(
      {
        ...raw,
        accountIdByLocalId: {
          ...raw.accountIdByLocalId,
          captures: { [local.id]: ACCOUNT_CAPTURE_ID },
        },
      },
      {
        type: "syncPersistedWorkflow",
        payload: payload({
          captures: [{ ...local, id: ACCOUNT_CAPTURE_ID, status: "new" }],
          idAliases: aliases(new Map([[local.id, ACCOUNT_CAPTURE_ID]])),
        }),
      },
    );
    expect(synced.captureItems.map((c) => c.id)).toEqual([ACCOUNT_CAPTURE_ID]);

    // The parse was started from the device-id snapshot taken at the tap.
    const parsed = buildParsedWorkflowResult({
      response: parseCaptureRegressionFixtures.simpleTask!,
      capture: local,
      workflowAreaId: local.area_id,
      areas: synced.areas,
    });
    const after = appendParsedWorkflowResult(synced, parsed);

    expect(after.captureItems.map((c) => c.id)).toEqual([ACCOUNT_CAPTURE_ID]);
    expect(after.taskDrafts.length).toBeGreaterThan(0);
    for (const draft of after.taskDrafts) {
      expect(draft.capture_item_id).toBe(ACCOUNT_CAPTURE_ID);
    }
    expect(selectUnsortedCaptures(after)).toEqual([]);
  });
});
