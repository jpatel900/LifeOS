import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as workflowData from "../data/workflow";
import * as browser from "../supabase/browser";
import * as parser from "../ai/parseCaptureClient";
import * as builder from "../ai/parseCaptureWorkflow";
import {
  createInitialWorkflowState,
  mockParseCapture,
  submitRawCapture,
} from "../workflow";
import { createApplyWorkflowState } from "./applyWorkflowState";
import { createCaptureParseOps, type CaptureParseDeps } from "./captureParse";
import type { CaptureParseState } from "./types";
import { AI_SORTING_FAILED_NOT_SORTED } from "../statusVocabulary";

function harness() {
  const stateRef = {
    current: submitRawCapture(createInitialWorkflowState(), {
      rawText: "Synthetic settlement thought",
      areaId: "area-personal",
    }),
  };
  const capture = stateRef.current.captureItems[0]!;
  const fixture = mockParseCapture({
    rawText: capture.raw_text,
    areaId: capture.area_id,
  });
  const parsed: builder.ParsedWorkflowResult = {
    ...fixture,
    captureItem: { ...fixture.captureItem, id: capture.id },
    taskDrafts: [{ ...fixture.taskDraft, capture_item_id: capture.id }],
    projectDrafts: fixture.projectDraft
      ? [{ ...fixture.projectDraft, capture_item_id: capture.id }]
      : [],
    timeBlockProposalDrafts: [
      { ...fixture.timeBlockProposalDraft, capture_item_id: capture.id },
    ],
    triageReasons: [],
    clarificationQuestions: [],
  };
  let phase: CaptureParseState = { phase: "idle" };
  const dispatch = vi.fn();
  const deps: CaptureParseDeps = {
    activeParseCaptureIdRef: { current: null },
    stateRef,
    persistedAreasRef: { current: [] },
    captureParse: phase,
    setCaptureParse: (next) => {
      phase = typeof next === "function" ? next(phase) : next;
    },
    applyWorkflowState: createApplyWorkflowState(stateRef, dispatch),
    persistCapture: vi.fn(async () => {}),
    markLocalOnly: vi.fn(),
    markPersistedSaveFailure: vi.fn(),
    refreshUnsyncedCount: vi.fn(async () => {}),
  };
  vi.spyOn(builder, "buildParsedWorkflowResult").mockReturnValue(parsed);
  return {
    stateRef,
    capture,
    parsed,
    dispatch,
    deps,
    phase: () => phase,
    ops: () => createCaptureParseOps({ ...deps, captureParse: phase }),
  };
}

describe("Sort settlement after local staging", () => {
  beforeEach(() => {
    vi.spyOn(browser, "createSupabaseBrowserClient").mockReturnValue(null);
    vi.spyOn(workflowData, "listPeople").mockResolvedValue([]);
    vi.spyOn(parser, "requestParseCapture").mockResolvedValue({
      ok: true,
      parser: "ai",
      status: "ai_configured",
      degraded: false,
      response: {} as never,
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["build", "apply"] as const)(
    "keeps failure retryable when %s throws before staging",
    async (stage) => {
      const h = harness();
      if (stage === "build")
        vi.mocked(builder.buildParsedWorkflowResult).mockImplementation(() => {
          throw new Error("synthetic build failure");
        });
      else
        h.deps.applyWorkflowState = () => {
          throw new Error("synthetic pre-mutation failure");
        };
      await h.ops().parseCaptureIntoDrafts(h.capture, "auto");
      expect(h.phase()).toMatchObject({
        phase: "failed",
        message: AI_SORTING_FAILED_NOT_SORTED,
        canRetryWithMock: true,
      });
      expect(h.stateRef.current.taskDrafts).toHaveLength(0);
      expect(h.stateRef.current.captureItems[0]).toBe(h.capture);
    },
  );

  it("reports kept drafts with a screen warning after real apply mutates the ref then dispatch throws", async () => {
    const h = harness();
    h.dispatch.mockImplementation(() => {
      throw new Error("synthetic dispatch failure");
    });
    await h.ops().parseCaptureIntoDrafts(h.capture, "auto");
    expect(h.stateRef.current.taskDrafts).toEqual(h.parsed.taskDrafts);
    expect(h.stateRef.current.captureItems[0]?.raw_text).toBe(
      h.capture.raw_text,
    );
    expect(h.phase()).toMatchObject({
      phase: "parsed",
      parser: "ai",
      warning:
        "Sorting finished, but the screen may not have updated. Your original thought is kept.",
    });
    expect(h.deps.markPersistedSaveFailure).not.toHaveBeenCalled();
    h.ops().retryCaptureParseWithMock();
    h.ops().sortCaptureIntoDrafts(h.capture.id);
    await Promise.resolve();
    expect(parser.requestParseCapture).toHaveBeenCalledTimes(1);
    expect(h.stateRef.current.taskDrafts).toHaveLength(
      h.parsed.taskDrafts.length,
    );
  });

  it("blocks a stale failed-phase retry handler after another attempt stages drafts", async () => {
    const h = harness();
    vi.mocked(parser.requestParseCapture).mockResolvedValueOnce({
      ok: false,
      status: "unknown",
      error: AI_SORTING_FAILED_NOT_SORTED,
      canRetryWithMock: true,
    });
    await h.ops().parseCaptureIntoDrafts(h.capture, "auto");
    expect(h.phase().phase).toBe("failed");
    const staleFailedOps = h.ops();

    await h.ops().parseCaptureIntoDrafts(h.capture, "auto");
    expect(h.phase().phase).toBe("parsed");
    const stagedState = h.stateRef.current;
    staleFailedOps.retryCaptureParseWithMock();
    await vi.waitFor(() => expect(h.phase().phase).not.toBe("parsing"));

    expect(parser.requestParseCapture).toHaveBeenCalledTimes(2);
    expect(h.stateRef.current).toBe(stagedState);
    expect(h.stateRef.current.taskDrafts).toHaveLength(
      h.parsed.taskDrafts.length,
    );
  });
  it("keeps unrelated work added during a post-mutation apply failure", async () => {
    const h = harness();
    h.dispatch.mockImplementation(() => {
      h.stateRef.current = submitRawCapture(h.stateRef.current, {
        rawText: "Synthetic concurrent thought",
        areaId: "area-personal",
      });
      throw new Error("synthetic dispatch failure");
    });
    await h.ops().parseCaptureIntoDrafts(h.capture, "auto");
    expect(h.phase().phase).toBe("parsed");
    expect(h.stateRef.current.captureItems).toHaveLength(2);
    expect(h.stateRef.current.taskDrafts).toEqual(h.parsed.taskDrafts);
  });

  it("does not report learning setup failure as a sort or account-save failure", async () => {
    const h = harness();
    vi.mocked(browser.createSupabaseBrowserClient)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockImplementationOnce(() => {
        throw new Error("synthetic learning setup failure");
      });
    await h.ops().parseCaptureIntoDrafts(h.capture, "auto");
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    expect(h.phase()).toMatchObject({
      phase: "parsed",
      warning: "Sorting finished. Some details could not be updated.",
    });
    expect(h.stateRef.current.taskDrafts).toEqual(h.parsed.taskDrafts);
    expect(h.deps.markPersistedSaveFailure).not.toHaveBeenCalled();
  });
});
