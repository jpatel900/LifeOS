import { afterEach, describe, expect, it, vi } from "vitest";
import { requestParseCapture } from "./parseCaptureClient";
import { AI_SORTING_FAILED_NOT_SORTED } from "../statusVocabulary";
import { openAiStructuredOutputProvider } from "./provider/openai";

const PROVIDER_DEADLINE_MS = 30_000;
const CLIENT_DEADLINE_MS = 35_000;
const validBody = {
  ok: true,
  parser: "ai",
  status: "ai_configured",
  response: {
    schema_version: "1.0",
    prompt_version: "parse_capture.v3",
    parse_status: "parsed",
    overall_confidence: 0.9,
    triage_required: false,
    triage_reasons: [],
    drafts: [],
    clarification_questions: [],
    ambiguity_assessment: null,
  },
};
const providerRequest = {
  apiKey: "synthetic-key",
  model: "synthetic-model",
  messages: [],
  responseFormat: {},
};

function stalledFetch(stallBody: boolean) {
  let signal: AbortSignal | undefined;
  const never = new Promise<never>(() => {});
  const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => {
    signal = init?.signal ?? undefined;
    return stallBody ? Promise.resolve({ ok: true, json: () => never }) : never;
  }) as unknown as typeof fetch;
  return { fetchImpl, signal: () => signal };
}

afterEach(() => vi.useRealTimers());

describe.each([false, true])(
  "parse deadline (stalled body: %s)",
  (stallBody) => {
    it("returns the safe browser failure and aborts even when transport ignores cancellation", async () => {
      vi.useFakeTimers();
      const stalled = stalledFetch(stallBody);
      let result: Awaited<ReturnType<typeof requestParseCapture>> | undefined;
      const pending = requestParseCapture({
        rawText: "Synthetic saved thought",
        parserMode: "auto",
        fetchImpl: stalled.fetchImpl,
      }).then((value) => {
        result = value;
      });
      await vi.advanceTimersByTimeAsync(CLIENT_DEADLINE_MS - 1);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toEqual({
        ok: false,
        status: "unknown",
        error: AI_SORTING_FAILED_NOT_SORTED,
        canRetryWithMock: true,
      });
      expect(stalled.signal()?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await pending;
    });

    it("rejects the provider call and aborts before the browser deadline", async () => {
      vi.useFakeTimers();
      const stalled = stalledFetch(stallBody);
      let failure: unknown;
      const pending = openAiStructuredOutputProvider
        .generateStructuredOutput({
          ...providerRequest,
          fetchImpl: stalled.fetchImpl,
        })
        .catch((error: unknown) => {
          failure = error;
        });
      await vi.advanceTimersByTimeAsync(PROVIDER_DEADLINE_MS - 1);
      expect(failure).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(failure).toBeInstanceOf(Error);
      expect(stalled.signal()?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await pending;
    });
  },
);

it("clears deadlines on success and ordinary failure", async () => {
  vi.useFakeTimers();
  const successFetch = vi.fn(async () => ({
    ok: true,
    json: async () => validBody,
  })) as unknown as typeof fetch;
  expect(
    (
      await requestParseCapture({
        rawText: "Synthetic thought",
        parserMode: "auto",
        fetchImpl: successFetch,
      })
    ).ok,
  ).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const failureFetch = vi.fn(async () => {
    throw new Error("synthetic transport failure");
  }) as unknown as typeof fetch;
  expect(
    (
      await requestParseCapture({
        rawText: "Synthetic thought",
        parserMode: "auto",
        fetchImpl: failureFetch,
      })
    ).ok,
  ).toBe(false);
  await expect(
    openAiStructuredOutputProvider.generateStructuredOutput({
      ...providerRequest,
      fetchImpl: failureFetch,
    }),
  ).rejects.toThrow("synthetic transport failure");
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])(
  "keeps the timeout result after late transport settlement (reject: %s)",
  async (rejectLate) => {
    vi.useFakeTimers();
    let resolveFetch!: (value: unknown) => void;
    let rejectFetch!: (reason: Error) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          resolveFetch = resolve;
          rejectFetch = reject;
        }),
    ) as unknown as typeof fetch;
    const onResult = vi.fn();
    const pending = requestParseCapture({
      rawText: "Synthetic saved thought",
      parserMode: "auto",
      fetchImpl,
    }).then(onResult);
    await vi.advanceTimersByTimeAsync(CLIENT_DEADLINE_MS);
    await pending;
    if (rejectLate) rejectFetch(new Error("synthetic late rejection"));
    else resolveFetch({ ok: true, json: async () => validBody });
    await vi.advanceTimersByTimeAsync(0);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][0].ok).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("uses one browser budget for headers and body instead of restarting it", async () => {
  vi.useFakeTimers();
  let resolveFetch!: (value: unknown) => void;
  const fetchImpl = vi.fn(
    () =>
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
  ) as unknown as typeof fetch;
  let result: Awaited<ReturnType<typeof requestParseCapture>> | undefined;
  const pending = requestParseCapture({
    rawText: "Synthetic saved thought",
    parserMode: "auto",
    fetchImpl,
  }).then((value) => {
    result = value;
  });
  await vi.advanceTimersByTimeAsync(20_000);
  resolveFetch({ ok: true, json: () => new Promise(() => {}) });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(result?.ok).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  await pending;
});

it("preserves provider telemetry, HTTP errors and timer cleanup", async () => {
  vi.useFakeTimers();
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      output_text: "{}",
      model: "synthetic-model",
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    }),
  })) as unknown as typeof fetch;
  const result = await openAiStructuredOutputProvider.generateStructuredOutput({
    ...providerRequest,
    fetchImpl,
  });
  expect(result.outputText).toBe("{}");
  expect(result.telemetry.totalTokenCount).toBe(5);
  expect(vi.getTimerCount()).toBe(0);
  const errorFetch = vi.fn(async () => ({
    ok: false,
    status: 503,
  })) as unknown as typeof fetch;
  await expect(
    openAiStructuredOutputProvider.generateStructuredOutput({
      ...providerRequest,
      fetchImpl: errorFetch,
    }),
  ).rejects.toThrow("AI capture parsing request failed: 503");
  expect(vi.getTimerCount()).toBe(0);
});
