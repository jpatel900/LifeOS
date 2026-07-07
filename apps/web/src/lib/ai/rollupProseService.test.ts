import { describe, expect, it, vi } from "vitest";
import type { RollupSummaryContent } from "@lifeos/schemas";
import type { StructuredOutputProvider } from "./provider";
import {
  enhanceRollupProse,
  type EnhanceRollupProseInput,
} from "./rollupProseService";

const AI_ENV = {
  OPENAI_API_KEY: "sk-test",
  AI_MODEL_CHEAP: "test-cheap",
} satisfies Partial<NodeJS.ProcessEnv>;

function draft(
  overrides: Partial<RollupSummaryContent> = {},
): RollupSummaryContent {
  return {
    highlights: ["Shipped the parser fix", "Closed three stale tasks"],
    misses: ["Skipped the Tuesday review block"],
    counts: { wins: 2, completed_sessions: 5, missed_sessions: 1 },
    ...overrides,
  };
}

function input(
  overrides: Partial<EnhanceRollupProseInput> = {},
): EnhanceRollupProseInput {
  return {
    areaLabel: "Engineering",
    periodType: "week",
    periodLabel: "2026-06-29 – 2026-07-05",
    draft: draft(),
    ...overrides,
  };
}

// A provider that echoes whatever highlights/misses the test wants back.
function fakeProvider(
  reply: { highlights: string[]; misses: string[] } | Error,
): StructuredOutputProvider {
  return {
    id: "fake",
    generateStructuredOutput: vi.fn(async () => {
      if (reply instanceof Error) throw reply;
      return {
        outputText: JSON.stringify(reply),
        telemetry: { inputTokenCount: 10, outputTokenCount: 20 },
      };
    }),
  };
}

const noTrace = { recordAiCallTraceImpl: vi.fn(async () => {}) };

describe("enhanceRollupProse — deterministic guards", () => {
  it("returns the deterministic draft when forced to mock", async () => {
    const result = await enhanceRollupProse(input(), {
      forceMock: true,
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
    expect(result.summary).toEqual(draft());
  });

  it("returns deterministic when no API key is configured", async () => {
    const result = await enhanceRollupProse(input(), {
      env: { AI_MODEL_CHEAP: "test-cheap" },
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
  });

  it("returns deterministic (no AI call) when there is nothing to rephrase", async () => {
    const provider = fakeProvider({ highlights: [], misses: [] });
    const result = await enhanceRollupProse(
      input({ draft: draft({ highlights: [], misses: [] }) }),
      { env: AI_ENV, provider, ...noTrace },
    );
    expect(result.source).toBe("deterministic");
    expect(provider.generateStructuredOutput).not.toHaveBeenCalled();
  });

  it("is disabled by AI_ROLLUP_PROSE_ENABLED=false", async () => {
    const provider = fakeProvider({ highlights: ["x", "y"], misses: ["z"] });
    const result = await enhanceRollupProse(input(), {
      env: { ...AI_ENV, AI_ROLLUP_PROSE_ENABLED: "false" },
      provider,
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
    expect(provider.generateStructuredOutput).not.toHaveBeenCalled();
  });
});

describe("enhanceRollupProse — AI path (honesty by construction)", () => {
  it("maps rephrased items and keeps counts EXACTLY", async () => {
    const provider = fakeProvider({
      highlights: ["Shipped a parser fix 🎉", "Cleared 3 stale tasks"],
      misses: ["Missed Tuesday's review"],
    });
    const result = await enhanceRollupProse(input(), {
      env: AI_ENV,
      provider,
      ...noTrace,
    });
    expect(result.source).toBe("ai");
    expect(result.summary.highlights).toEqual([
      "Shipped a parser fix 🎉",
      "Cleared 3 stale tasks",
    ]);
    expect(result.summary.misses).toEqual(["Missed Tuesday's review"]);
    // Counts never go through the model.
    expect(result.summary.counts).toEqual(draft().counts);
  });

  it("falls back to deterministic when the model DROPS an item", async () => {
    const provider = fakeProvider({
      highlights: ["only one came back"], // source had 2
      misses: ["Missed Tuesday's review"],
    });
    const result = await enhanceRollupProse(input(), {
      env: AI_ENV,
      provider,
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
    expect(result.degraded).toBe(true);
    expect(result.summary).toEqual(draft());
  });

  it("falls back when the model ADDS an item", async () => {
    const provider = fakeProvider({
      highlights: ["a", "b"],
      misses: ["m1", "m2 invented"], // source had 1
    });
    const result = await enhanceRollupProse(input(), {
      env: AI_ENV,
      provider,
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
    expect(result.degraded).toBe(true);
  });

  it("falls back when the model returns an empty item", async () => {
    const provider = fakeProvider({
      highlights: ["kept", "   "],
      misses: ["Missed Tuesday's review"],
    });
    const result = await enhanceRollupProse(input(), {
      env: AI_ENV,
      provider,
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
    expect(result.degraded).toBe(true);
  });

  it("falls back when the provider throws (outage / invalid output)", async () => {
    const provider = fakeProvider(new Error("request failed: 503"));
    const result = await enhanceRollupProse(input(), {
      env: AI_ENV,
      provider,
      ...noTrace,
    });
    expect(result.source).toBe("deterministic");
    expect(result.degraded).toBe(true);
    expect(result.summary).toEqual(draft());
  });

  it("records one ai_call_traces row on the AI path (surface=rollup)", async () => {
    const record = vi.fn(async () => {});
    const provider = fakeProvider({
      highlights: ["a", "b"],
      misses: ["m"],
    });
    await enhanceRollupProse(input(), {
      env: AI_ENV,
      provider,
      traceContext: { accessToken: "token" },
      recordAiCallTraceImpl: record,
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "rollup",
        validationOutcome: "passed",
        accessToken: "token",
        promptVersion: expect.any(String),
      }),
    );
  });
});
