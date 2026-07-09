import { describe, expect, it, vi } from "vitest";
import { recordAiCallTrace } from "./aiCallTraces";

type InsertPayload = Record<string, unknown>;

function makeClient(options: {
  user?: { id: string } | null;
  userError?: { message: string } | null;
  insertError?: { message: string } | null;
  onInsert?: (payload: InsertPayload) => void;
}) {
  const insert = vi.fn(async (payload: InsertPayload) => {
    options.onInsert?.(payload);
    return { error: options.insertError ?? null };
  });

  return {
    client: {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: options.user === undefined ? { id: "user-a" } : options.user,
          },
          error: options.userError ?? null,
        })),
      },
      from: vi.fn(() => ({ insert })),
    },
    insert,
  };
}

const baseInput = {
  accessToken: "user-a-token",
  surface: "parse",
  promptVersion: "parse_capture.v1",
  model: "standard-model",
  latencyMs: 42,
  validationOutcome: "passed" as const,
};

describe("recordAiCallTrace", () => {
  it("inserts one metadata-only row scoped to the resolved user", async () => {
    let captured: InsertPayload | undefined;
    const { client, insert } = makeClient({
      onInsert: (payload) => {
        captured = payload;
      },
    });

    await recordAiCallTrace(
      { ...baseInput, inputTokens: 12, outputTokens: 18 },
      { createClientImpl: () => client as never },
    );

    expect(insert).toHaveBeenCalledTimes(1);
    expect(captured).toEqual({
      user_id: "user-a",
      surface: "parse",
      prompt_version: "parse_capture.v1",
      model: "standard-model",
      input_tokens: 12,
      output_tokens: 18,
      latency_ms: 42,
      validation_outcome: "passed",
    });
    // Privacy doctrine: only metadata columns are ever inserted.
    expect(Object.keys(captured ?? {})).toEqual([
      "user_id",
      "surface",
      "prompt_version",
      "model",
      "input_tokens",
      "output_tokens",
      "latency_ms",
      "validation_outcome",
    ]);
  });

  it("normalizes token counts and clamps latency to non-negative integers", async () => {
    let captured: InsertPayload | undefined;
    const { client } = makeClient({
      onInsert: (payload) => {
        captured = payload;
      },
    });

    await recordAiCallTrace(
      {
        ...baseInput,
        inputTokens: 5.6,
        outputTokens: -3,
        latencyMs: -10,
      },
      { createClientImpl: () => client as never },
    );

    expect(captured).toMatchObject({
      input_tokens: 6,
      output_tokens: null,
      latency_ms: 0,
    });
  });

  it("skips the insert and warns when no access token is provided", async () => {
    const warn = vi.fn();
    const { client, insert } = makeClient({});

    await recordAiCallTrace(
      { ...baseInput, accessToken: null },
      { createClientImpl: () => client as never, warn },
    );

    expect(insert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ai_call_traces"),
    );
  });

  it("degrades silently when Supabase is not configured (null client)", async () => {
    const warn = vi.fn();

    await expect(
      recordAiCallTrace(baseInput, {
        createClientImpl: () => null as never,
        warn,
      }),
    ).resolves.toBeUndefined();

    expect(warn).not.toHaveBeenCalled();
  });

  it("skips the insert and warns when the caller cannot be resolved", async () => {
    const warn = vi.fn();
    const { client, insert } = makeClient({
      user: null,
      userError: { message: "no user" },
    });

    await recordAiCallTrace(baseInput, {
      createClientImpl: () => client as never,
      warn,
    });

    expect(insert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ai_call_traces"),
    );
  });

  it("warns but never throws when the insert returns an error", async () => {
    const warn = vi.fn();
    const { client } = makeClient({
      insertError: { message: "insert denied" },
    });

    await expect(
      recordAiCallTrace(baseInput, {
        createClientImpl: () => client as never,
        warn,
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("insert denied"));
  });

  it("swallows unexpected exceptions so the user path is never affected", async () => {
    const warn = vi.fn();

    await expect(
      recordAiCallTrace(baseInput, {
        createClientImpl: () => {
          throw new Error("client construction blew up");
        },
        warn,
      }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("client construction blew up"),
    );
  });
});
