import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCaptureDetailed } from "./parseCapture";
import { taskMapDraftDetailed } from "./taskMapDraft";
import { enhanceRollupProse } from "./rollupProseService";
import { openAiStructuredOutputProvider } from "./provider/openai";
import type { StructuredOutputProvider } from "./provider";

const parseResponse = {
  schema_version: "1.0",
  prompt_version: "parse_capture.v3",
  parse_status: "parsed",
  overall_confidence: 0.9,
  triage_required: false,
  triage_reasons: [],
  drafts: [],
  clarification_questions: [],
  ambiguity_assessment: null,
};
const taskMap = {
  schema_version: "1.1",
  nodes: [{ id: "step-1", title: "Synthetic step", role: "required" }],
  edges: [],
};
const prose = { highlights: ["Synthetic progress"], misses: [] };
const env = {
  OPENAI_API_KEY: "synthetic-key",
  AI_MODEL_STANDARD: "synthetic-model",
};
const rollupInput = {
  areaLabel: "Synthetic area",
  periodType: "week" as const,
  periodLabel: "Synthetic week",
  draft: {
    ...prose,
    counts: { wins: 1, completed_sessions: 1, missed_sessions: 0 },
  },
};

afterEach(() => vi.useRealTimers());

describe("caller-owned provider budgets", () => {
  it("passes a 30s Sort budget to the provider", async () => {
    const generateStructuredOutput = vi.fn(async () => ({
      outputText: JSON.stringify(parseResponse),
      telemetry: {},
    }));
    const result = await parseCaptureDetailed(
      { rawText: "Synthetic saved thought" },
      {
        apiKey: env.OPENAI_API_KEY,
        model: env.AI_MODEL_STANDARD,
        provider: { id: "synthetic", generateStructuredOutput },
      },
    );
    expect(result.response).toEqual(parseResponse);
    expect(generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineMs: 30_000 }),
    );
  });

  it("passes a 50s task-map budget to the provider", async () => {
    const generateStructuredOutput = vi.fn(async () => ({
      outputText: JSON.stringify(taskMap),
      telemetry: {},
    }));
    const result = await taskMapDraftDetailed(
      { title: "Synthetic task" },
      {
        apiKey: env.OPENAI_API_KEY,
        model: env.AI_MODEL_STANDARD,
        provider: { id: "synthetic", generateStructuredOutput },
      },
    );
    expect(result.draft).toEqual(taskMap);
    expect(generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineMs: 50_000 }),
    );
  });

  it("passes a 50s rollup budget to the provider", async () => {
    const generateStructuredOutput = vi.fn(async () => ({
      outputText: JSON.stringify(prose),
      telemetry: {},
    }));
    const result = await enhanceRollupProse(rollupInput, {
      env,
      provider: { id: "synthetic", generateStructuredOutput },
      recordAiCallTraceImpl: vi.fn(async () => {}),
    });
    expect(result).toEqual({ source: "ai", summary: rollupInput.draft });
    expect(generateStructuredOutput).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineMs: 50_000 }),
    );
  });

  it.each(["task-map", "rollup"] as const)(
    "allows %s success after 30s and before its 50s budget",
    async (caller) => {
      vi.useFakeTimers();
      let resolveBody!: (value: unknown) => void;
      let signal: AbortSignal | undefined;
      const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return {
          ok: true,
          json: () =>
            new Promise((resolve) => {
              resolveBody = resolve;
            }),
        };
      }) as unknown as typeof fetch;
      const provider: StructuredOutputProvider = {
        id: "synthetic-transport",
        generateStructuredOutput: (request) =>
          openAiStructuredOutputProvider.generateStructuredOutput({
            ...request,
            fetchImpl,
          }),
      };
      const onResult = vi.fn();
      const pending = (
        caller === "task-map"
          ? taskMapDraftDetailed(
              { title: "Synthetic task" },
              {
                apiKey: env.OPENAI_API_KEY,
                model: env.AI_MODEL_STANDARD,
                provider,
              },
            )
          : enhanceRollupProse(rollupInput, {
              env,
              provider,
              recordAiCallTraceImpl: vi.fn(async () => {}),
            })
      ).then(onResult, onResult);
      await vi.advanceTimersByTimeAsync(40_000);
      expect(onResult).not.toHaveBeenCalled();
      expect(signal?.aborted).toBe(false);
      resolveBody({
        output_text: JSON.stringify(caller === "task-map" ? taskMap : prose),
      });
      await pending;
      expect(onResult).toHaveBeenCalledExactlyOnceWith(
        caller === "task-map"
          ? expect.objectContaining({ draft: taskMap })
          : { source: "ai", summary: rollupInput.draft },
      );
      expect(signal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
