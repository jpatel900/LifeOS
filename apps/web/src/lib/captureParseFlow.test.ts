import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParseCaptureResponseSchema } from "@lifeos/schemas";
import { postParseCaptureAuthenticated } from "@/__tests__/helpers/parseCaptureFetch";
import { buildParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";
import {
  acceptDraft,
  appendParsedWorkflowResult,
  createInitialWorkflowState,
  submitRawCapture,
} from "@/lib/workflow";

import * as workflowData from "./data/workflow";
import * as supabaseBrowser from "./supabase/browser";
import {
  createCaptureParseOps,
  type CaptureParseDeps,
} from "./workflowContext/captureParse";
import type { CaptureParseState } from "./workflowContext/types";
import { AI_SORTING_FAILED_NOT_SORTED } from "./statusVocabulary";
import { PARSE_CAPTURE_CLIENT_DEADLINE_MS } from "./ai/requestDeadline";

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

function deadlineHarness() {
  const stateRef = {
    current: submitRawCapture(createInitialWorkflowState(), {
      rawText: "Synthetic deadline capture",
      areaId: "area-personal",
    }),
  };
  let parseState: CaptureParseState = { phase: "idle" };
  const deps: CaptureParseDeps = {
    activeParseCaptureIdRef: { current: null },
    setCaptureParse: (next) => {
      parseState = typeof next === "function" ? next(parseState) : next;
    },
    captureParse: parseState,
    stateRef,
    persistedAreasRef: { current: [] },
    applyWorkflowState: (next) => {
      stateRef.current = next;
    },
    persistCapture: vi.fn(async () => {}),
    markLocalOnly: vi.fn(),
    markPersistedSaveFailure: vi.fn(),
    refreshUnsyncedCount: vi.fn(async () => {}),
  };
  return {
    stateRef,
    capture: stateRef.current.captureItems[0]!,
    phase: () => parseState,
    ops: () => createCaptureParseOps({ ...deps, captureParse: parseState }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("the complete Sort deadline", () => {
  const session = { data: { session: { access_token: "synthetic-token" } } };
  let getSession: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const successBody = {
    ok: true,
    parser: "mock",
    status: "mock",
    response: {
      schema_version: "1.0",
      prompt_version: "parse_capture.v3",
      parse_status: "parsed",
      overall_confidence: 0.8,
      triage_required: true,
      triage_reasons: [],
      drafts: [],
      clarification_questions: [],
      ambiguity_assessment: null,
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    getSession = vi.fn(async () => session);
    vi.spyOn(supabaseBrowser, "createSupabaseBrowserClient").mockReturnValue({
      auth: { getSession },
    } as unknown as ReturnType<
      typeof supabaseBrowser.createSupabaseBrowserClient
    >);
    vi.spyOn(workflowData, "getOperatorProfile").mockResolvedValue(null);
    vi.spyOn(workflowData, "listPeople").mockResolvedValue([]);
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => successBody,
    }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("settles a stalled people lookup, preserves raw text and never launches a late paid request", async () => {
    const people =
      deferred<Awaited<ReturnType<typeof workflowData.listPeople>>>();
    vi.mocked(workflowData.listPeople).mockReturnValueOnce(people.promise);
    const harness = deadlineHarness();
    let settled = false;
    const pending = harness
      .ops()
      .parseCaptureIntoDrafts(harness.capture, "auto")
      .then(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(0);
    expect(workflowData.listPeople).toHaveBeenCalledTimes(1);
    expect(harness.phase().phase).toBe("parsing");
    await vi.advanceTimersByTimeAsync(PARSE_CAPTURE_CLIENT_DEADLINE_MS);
    expect(harness.phase()).toEqual({
      phase: "failed",
      captureId: harness.capture.id,
      status: "unknown",
      message: AI_SORTING_FAILED_NOT_SORTED,
      canRetryWithMock: true,
    });
    expect(settled).toBe(true);
    expect(harness.stateRef.current.captureItems[0]?.raw_text).toBe(
      "Synthetic deadline capture",
    );
    expect(harness.stateRef.current.taskDrafts).toHaveLength(0);
    people.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(harness.phase().phase).toBe("failed");
    expect(vi.getTimerCount()).toBe(0);
    await pending;
  });

  it.each(["session", "profile"] as const)(
    "also bounds a stalled %s lookup",
    async (lookup) => {
      const stalled = deferred<never>();
      if (lookup === "session") getSession.mockReturnValueOnce(stalled.promise);
      else
        vi.mocked(workflowData.getOperatorProfile).mockReturnValueOnce(
          stalled.promise,
        );
      const harness = deadlineHarness();
      const pending = harness
        .ops()
        .parseCaptureIntoDrafts(harness.capture, "auto");
      await vi.advanceTimersByTimeAsync(PARSE_CAPTURE_CLIENT_DEADLINE_MS);
      expect(harness.phase().phase).toBe("failed");
      expect(fetchMock).not.toHaveBeenCalled();
      stalled.reject(new Error("synthetic late lookup error"));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(workflowData.listPeople).not.toHaveBeenCalled();
      await pending;
    },
  );

  it("does not let a late lookup overwrite a successful retry of the same capture", async () => {
    const people =
      deferred<Awaited<ReturnType<typeof workflowData.listPeople>>>();
    vi.mocked(workflowData.listPeople).mockReturnValueOnce(people.promise);
    const harness = deadlineHarness();
    const first = harness.ops().parseCaptureIntoDrafts(harness.capture, "auto");
    await vi.advanceTimersByTimeAsync(PARSE_CAPTURE_CLIENT_DEADLINE_MS);
    expect(harness.phase().phase).toBe("failed");
    await harness.ops().parseCaptureIntoDrafts(harness.capture, "mock");
    expect(harness.phase().phase).toBe("parsed");
    const stateAfterRetry = harness.stateRef.current;
    people.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(harness.phase().phase).toBe("parsed");
    expect(harness.stateRef.current).toBe(stateAfterRetry);
    expect(vi.getTimerCount()).toBe(0);
    await first;
  });

  it("shares the original budget with a stalled request body and aborts the transport", async () => {
    const people =
      deferred<Awaited<ReturnType<typeof workflowData.listPeople>>>();
    vi.mocked(workflowData.listPeople).mockReturnValueOnce(people.promise);
    const body = deferred<typeof successBody>();
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => body.promise });
    const harness = deadlineHarness();
    const pending = harness
      .ops()
      .parseCaptureIntoDrafts(harness.capture, "auto");
    await vi.advanceTimersByTimeAsync(20_000);
    people.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit)?.signal;
    expect(signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(harness.phase().phase).toBe("failed");
    expect(signal?.aborted).toBe(true);
    const stateAtTimeout = harness.stateRef.current;
    body.resolve(successBody);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.stateRef.current).toBe(stateAtTimeout);
    expect(harness.stateRef.current.taskDrafts).toHaveLength(0);
    expect(harness.phase().phase).toBe("failed");
    expect(vi.getTimerCount()).toBe(0);
    await pending;
  });
  it("ignores a superseded attempt even when a newer attempt has the same capture id", async () => {
    const earlier =
      deferred<Awaited<ReturnType<typeof workflowData.listPeople>>>();
    vi.mocked(workflowData.listPeople).mockReturnValueOnce(earlier.promise);
    const harness = deadlineHarness();
    const first = harness.ops().parseCaptureIntoDrafts(harness.capture, "auto");
    await vi.advanceTimersByTimeAsync(0);
    // The direct module seam tests stale-result isolation, not concurrent UI sorts.
    await harness.ops().parseCaptureIntoDrafts(harness.capture, "mock");
    const stateAfterRetry = harness.stateRef.current;
    expect(harness.phase().phase).toBe("parsed");
    earlier.resolve([]);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(harness.stateRef.current).toBe(stateAfterRetry);
    expect(harness.phase().phase).toBe("parsed");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not start body reading after a timed-out fetch resolves late", async () => {
    const response = deferred<unknown>();
    const json = vi.fn(async () => successBody);
    fetchMock.mockReturnValueOnce(response.promise);
    const harness = deadlineHarness();
    const pending = harness
      .ops()
      .parseCaptureIntoDrafts(harness.capture, "auto");
    await vi.advanceTimersByTimeAsync(PARSE_CAPTURE_CLIENT_DEADLINE_MS);
    expect(harness.phase().phase).toBe("failed");
    response.resolve({ ok: true, json });
    await vi.advanceTimersByTimeAsync(0);
    expect(json).not.toHaveBeenCalled();
    expect(harness.phase().phase).toBe("failed");
    expect(vi.getTimerCount()).toBe(0);
    await pending;
  });
});
