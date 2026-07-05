import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";
import { describe, expect, it, vi } from "vitest";
import type { RecordAiCallTraceInput } from "@/lib/observability";
import { PARSE_CAPTURE_SCHEMA_VERSION } from "./contracts/parseCapture";
import { PARSE_CAPTURE_PROMPT_VERSION } from "./prompts/parseCapturePrompt";
import {
  getParseCaptureStatus,
  parseCaptureWithFallback,
} from "./parseCaptureService";
import { buildParsedWorkflowResult } from "./parseCaptureWorkflow";

const aiResponse: ParseCaptureResponse = {
  schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
  prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
  parse_status: "parsed",
  overall_confidence: 0.83,
  triage_required: false,
  triage_reasons: [],
  drafts: [
    {
      draft_type: "task_draft",
      title: "Email Taylor about launch notes",
      description: "Capture mentions a follow-up email.",
      area_slug_suggestion: "main-job",
      first_tiny_step: "Open the launch notes",
      estimated_minutes_low: 10,
      estimated_minutes_high: 20,
      due_at: null,
      confidence: 0.83,
      breakdown: null,
      person_mentions: [{ name: "Taylor", role: "mention", confidence: 0.8 }],
      is_commitment: false,
    },
  ],
  clarification_questions: [],
  ambiguity_assessment: null,
};

const persistedCapture = {
  id: "550e8400-e29b-41d4-a716-446655440201",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  raw_text: "Email Taylor about launch notes",
  raw_audio_ref: null,
  capture_mode: "text" as const,
  inferred_area_confidence: null,
  status: "new" as const,
  created_at: "2026-05-08T12:00:00.000Z",
};

describe("parse capture server service", () => {
  it("reports parser status as configured when AI is enabled and model+key are present", () => {
    const status = getParseCaptureStatus({
      OPENAI_API_KEY: "test-key",
      AI_MODEL_STANDARD: "standard-model",
    });

    expect(status).toEqual({
      status: "ai_configured",
      preferredParser: "ai",
    });
  });

  it("reports parser status as unavailable when AI is enabled but missing model", () => {
    const status = getParseCaptureStatus({
      OPENAI_API_KEY: "test-key",
    });

    expect(status).toEqual({
      status: "ai_unavailable",
      preferredParser: "mock",
    });
  });

  it("reports parser status as mock when AI parsing is disabled", () => {
    const status = getParseCaptureStatus({
      OPENAI_API_KEY: "test-key",
      AI_MODEL_STANDARD: "standard-model",
      AI_PARSE_CAPTURE_ENABLED: "false",
    });

    expect(status).toEqual({
      status: "mock",
      preferredParser: "mock",
    });
  });

  it("uses the mock parser fallback when no API key is configured", async () => {
    const parseCaptureImpl = vi.fn();

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: { AI_MODEL_STANDARD: "standard-model" },
        parseCaptureImpl,
      },
    );

    expect(result.parser).toBe("mock");
    expect(parseCaptureImpl).not.toHaveBeenCalled();
    expect(result.response.schema_version).toBe(PARSE_CAPTURE_SCHEMA_VERSION);
    expect(result.response.drafts[0]?.draft_type).toBe("task_draft");
  });

  it("keeps mock parser outputs schema-valid across representative capture fixtures", async () => {
    const rawInputs = [
      "Follow up with Alex about event sponsorship.",
      "Need to get volunteer ops under control before next event. Too many loose ends.",
      "Main Job + Side Project overlap: auth flow notes and deployment checklist.",
      "Plan a 45-minute prep block for Monday planning packet.",
      "Blocked: vendor ownership unclear, missing contract detail.",
      "idk maybe do admin things but not sure where this belongs",
      "brain dump: taxes, project notes, dentist, invoices, family logistics",
    ];

    for (const rawText of rawInputs) {
      const result = await parseCaptureWithFallback(
        { rawText },
        { env: { AI_MODEL_STANDARD: "standard-model" } },
      );

      expect(result.parser).toBe("mock");
      expect(
        ParseCaptureResponseSchema.safeParse(result.response).success,
      ).toBe(true);
      expect(result.response.triage_required).toBe(true);
    }
  });

  it("emits a project draft from mock parsing for clearly project-shaped captures", async () => {
    const result = await parseCaptureWithFallback(
      { rawText: "Need a project to organize volunteer ops system." },
      { env: { AI_MODEL_STANDARD: "standard-model" } },
    );

    expect(result.parser).toBe("mock");
    expect(
      result.response.drafts.some(
        (draft) => draft.draft_type === "project_draft",
      ),
    ).toBe(true);
  });

  it("uses the AI parser when an API key and model tier are configured", async () => {
    const parseCaptureImpl = vi.fn(async () => aiResponse);

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        parseCaptureImpl,
      },
    );

    expect(result).toEqual({
      parser: "ai",
      response: aiResponse,
      telemetry: {
        modelName: "standard-model",
      },
    });
    expect(parseCaptureImpl).toHaveBeenCalledWith(
      { rawText: "Email Taylor about launch notes", areaContext: undefined },
      { apiKey: "test-key", model: "standard-model" },
    );
  });

  it("emits safe metadata-only tracing for successful AI parses", async () => {
    const originalFetch = global.fetch;
    const traceParseCaptureImpl = vi.fn(async (input, run) => {
      const value = await run();

      expect(input.parser).toBe("ai");
      expect(input.provider).toBe("openai");
      expect(input.metadata).toEqual({
        fallback_used: false,
        model_name: "standard-model",
        model_tier_label: "standard",
      });
      expect(input.finalizeMetadata?.({ ok: true, value })).toEqual({
        fallback_used: false,
        input_token_count: 12,
        model_name: "gpt-4o-mini-2026-05-01",
        output_token_count: 18,
        parse_status: "parsed",
        prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
        schema_version: "1.0",
        status: "succeeded",
        total_token_count: 30,
        validation_status: "validated",
      });
      expect(
        JSON.stringify(input.finalizeMetadata?.({ ok: true, value })),
      ).not.toMatch(/rawText|Taylor|launch notes/i);

      return value;
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        model: "gpt-4o-mini-2026-05-01",
        usage: {
          input_tokens: 12,
          output_tokens: 18,
          total_tokens: 30,
        },
        output_text: JSON.stringify(aiResponse),
      }),
    })) as unknown as typeof fetch;

    await expect(
      parseCaptureWithFallback(
        { rawText: "Email Taylor about launch notes" },
        {
          env: {
            OPENAI_API_KEY: "test-key",
            AI_MODEL_STANDARD: "standard-model",
          },
          traceParseCaptureImpl,
        },
      ),
    ).resolves.toEqual({
      parser: "ai",
      response: aiResponse,
      telemetry: {
        estimatedCostUsd: undefined,
        inputTokenCount: 12,
        modelName: "gpt-4o-mini-2026-05-01",
        outputTokenCount: 18,
        totalTokenCount: 30,
      },
    });

    global.fetch = originalFetch;
  });

  it("falls back to AI_MODEL_CHEAP when AI_MODEL_STANDARD is not set", async () => {
    const parseCaptureImpl = vi.fn(async () => aiResponse);

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_CHEAP: "cheap-model",
        },
        parseCaptureImpl,
      },
    );

    expect(result).toEqual({
      parser: "ai",
      response: aiResponse,
      telemetry: {
        modelName: "cheap-model",
      },
    });
    expect(parseCaptureImpl).toHaveBeenCalledWith(
      { rawText: "Email Taylor about launch notes", areaContext: undefined },
      { apiKey: "test-key", model: "cheap-model" },
    );
  });

  it("uses the mock parser fallback when AI parsing is explicitly disabled", async () => {
    const parseCaptureImpl = vi.fn(async () => aiResponse);

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
          AI_PARSE_CAPTURE_ENABLED: "false",
        },
        parseCaptureImpl,
      },
    );

    expect(result.parser).toBe("mock");
    expect(parseCaptureImpl).not.toHaveBeenCalled();
  });

  it("keeps mock parser fallback behavior unchanged when tracing is injected", async () => {
    const traceParseCaptureImpl = vi.fn(async (input, run) => {
      const value = await run();

      expect(input.parser).toBe("mock");
      expect(input.provider).toBe("mock");
      expect(input.finalizeMetadata?.({ ok: true, value })).toMatchObject({
        fallback_used: true,
        parse_status: "parsed",
        status: "succeeded",
        validation_status: "validated",
      });

      return value;
    });

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: { AI_MODEL_STANDARD: "standard-model" },
        traceParseCaptureImpl,
      },
    );

    expect(result.parser).toBe("mock");
    expect(result.response.drafts[0]?.draft_type).toBe("task_draft");
  });

  it("emits a safe error category when AI parsing fails before validation", async () => {
    const traceParseCaptureImpl = vi.fn(async (input, run) => {
      try {
        await run();
      } catch (error) {
        expect(input.finalizeMetadata?.({ ok: false, error })).toEqual({
          error_category: "provider_invalid_json",
          fallback_used: false,
          status: "failed",
          validation_status: "not_run",
        });
        expect(
          JSON.stringify(input.finalizeMetadata?.({ ok: false, error })),
        ).not.toMatch(/secret|Email Taylor/i);
        throw error;
      }

      throw new Error("Expected AI parse failure.");
    });

    await expect(
      parseCaptureWithFallback(
        { rawText: "Email Taylor about launch notes" },
        {
          env: {
            OPENAI_API_KEY: "test-key",
            AI_MODEL_STANDARD: "standard-model",
          },
          parseCaptureImpl: vi.fn(async () => {
            throw new Error(
              "AI capture parsing response was not valid JSON. secret payload",
            );
          }),
          traceParseCaptureImpl,
        },
      ),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("does not leak raw content when schema validation fails", async () => {
    const traceParseCaptureImpl = vi.fn(async (input, run) => {
      try {
        await run();
      } catch (error) {
        expect(input.finalizeMetadata?.({ ok: false, error })).toEqual({
          error_category: "provider_schema_validation_failed",
          fallback_used: false,
          status: "failed",
          validation_status: "failed",
        });
        expect(
          JSON.stringify(input.finalizeMetadata?.({ ok: false, error })),
        ).not.toMatch(/Taylor|private task title|launch notes/i);
        throw error;
      }

      throw new Error("Expected validation failure.");
    });

    await expect(
      parseCaptureWithFallback(
        { rawText: "Email Taylor about launch notes" },
        {
          env: {
            OPENAI_API_KEY: "test-key",
            AI_MODEL_STANDARD: "standard-model",
          },
          parseCaptureImpl: vi.fn(async () => {
            throw new Error(
              "AI capture parsing response failed schema validation: private task title",
            );
          }),
          traceParseCaptureImpl,
        },
      ),
    ).rejects.toThrow(/failed schema validation/i);
  });

  it("keeps token and cost metadata optional when unavailable", async () => {
    const traceParseCaptureImpl = vi.fn(async (input, run) => {
      const value = await run();

      expect(input.finalizeMetadata?.({ ok: true, value })).toEqual({
        fallback_used: false,
        model_name: "standard-model",
        parse_status: "parsed",
        prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
        schema_version: "1.0",
        status: "succeeded",
        validation_status: "validated",
      });

      return value;
    });

    await expect(
      parseCaptureWithFallback(
        { rawText: "Email Taylor about launch notes" },
        {
          env: {
            OPENAI_API_KEY: "test-key",
            AI_MODEL_STANDARD: "standard-model",
          },
          parseCaptureImpl: vi.fn(async () => aiResponse),
          traceParseCaptureImpl,
        },
      ),
    ).resolves.toMatchObject({
      parser: "ai",
      response: aiResponse,
    });
  });

  it("uses the mock parser when forced by route/UI recovery", async () => {
    const parseCaptureImpl = vi.fn(async () => aiResponse);

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        forceMock: true,
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        parseCaptureImpl,
      },
    );

    expect(result.parser).toBe("mock");
    expect(parseCaptureImpl).not.toHaveBeenCalled();
  });

  it("marks low-confidence AI output for triage after raw capture persistence", () => {
    const result = buildParsedWorkflowResult({
      response: {
        ...aiResponse,
        parse_status: "low_confidence",
        overall_confidence: 0.48,
        triage_required: true,
        triage_reasons: ["Overall confidence is below the triage threshold."],
      },
      capture: persistedCapture,
      workflowAreaId: "area-main-job",
    });

    expect(result.captureItem.id).toBe(persistedCapture.id);
    expect(result.captureItem.status).toBe("triage_required");
    expect(result.taskDrafts).toHaveLength(1);
    expect(result.taskDrafts[0]?.status).toBe("pending");
    expect(result.taskDrafts[0]?.capture_item_id).toBe(persistedCapture.id);
  });

  it("records exactly one metadata-only trace row on a successful AI parse (issue #288)", async () => {
    const recordAiCallTraceImpl = vi.fn(
      async (_input: RecordAiCallTraceInput) => {},
    );

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: {
          OPENAI_API_KEY: "test-key",
          AI_MODEL_STANDARD: "standard-model",
        },
        parseCaptureImpl: vi.fn(async () => aiResponse),
        traceContext: { accessToken: "user-a-access-token" },
        recordAiCallTraceImpl,
      },
    );

    expect(result.parser).toBe("ai");
    expect(recordAiCallTraceImpl).toHaveBeenCalledTimes(1);

    const traceInput = recordAiCallTraceImpl.mock.calls[0]?.[0];
    expect(traceInput).toMatchObject({
      accessToken: "user-a-access-token",
      surface: "parse",
      promptVersion: PARSE_CAPTURE_PROMPT_VERSION,
      model: "standard-model",
      validationOutcome: "passed",
    });
    expect(typeof traceInput?.latencyMs).toBe("number");
    // Privacy doctrine: no raw prompt/response content may reach the trace.
    expect(JSON.stringify(traceInput)).not.toMatch(/Taylor|launch notes/i);
  });

  it("records exactly one failed trace row when AI parsing throws (issue #288)", async () => {
    const recordAiCallTraceImpl = vi.fn(
      async (_input: RecordAiCallTraceInput) => {},
    );

    await expect(
      parseCaptureWithFallback(
        { rawText: "Email Taylor about launch notes" },
        {
          env: {
            OPENAI_API_KEY: "test-key",
            AI_MODEL_STANDARD: "standard-model",
          },
          parseCaptureImpl: vi.fn(async () => {
            throw new Error("AI provider request failed. secret payload");
          }),
          traceContext: { accessToken: "user-a-access-token" },
          recordAiCallTraceImpl,
        },
      ),
    ).rejects.toThrow(/request failed/i);

    expect(recordAiCallTraceImpl).toHaveBeenCalledTimes(1);
    const traceInput = recordAiCallTraceImpl.mock.calls[0]?.[0];
    expect(traceInput).toMatchObject({
      surface: "parse",
      validationOutcome: "failed",
    });
    expect(JSON.stringify(traceInput)).not.toMatch(/Taylor|secret payload/i);
  });

  it("maps schema validation failures to the schema_failed trace outcome (issue #288)", async () => {
    const recordAiCallTraceImpl = vi.fn(
      async (_input: RecordAiCallTraceInput) => {},
    );

    await expect(
      parseCaptureWithFallback(
        { rawText: "Email Taylor about launch notes" },
        {
          env: {
            OPENAI_API_KEY: "test-key",
            AI_MODEL_STANDARD: "standard-model",
          },
          parseCaptureImpl: vi.fn(async () => {
            throw new Error(
              "AI capture parsing response failed schema validation: private title",
            );
          }),
          traceContext: { accessToken: "user-a-access-token" },
          recordAiCallTraceImpl,
        },
      ),
    ).rejects.toThrow(/failed schema validation/i);

    expect(recordAiCallTraceImpl).toHaveBeenCalledTimes(1);
    expect(recordAiCallTraceImpl.mock.calls[0]?.[0]).toMatchObject({
      validationOutcome: "schema_failed",
    });
  });

  it("does not record a trace row for the mock parser path (issue #288)", async () => {
    const recordAiCallTraceImpl = vi.fn(async () => {});

    const result = await parseCaptureWithFallback(
      { rawText: "Email Taylor about launch notes" },
      {
        env: { AI_MODEL_STANDARD: "standard-model" },
        traceContext: { accessToken: "user-a-access-token" },
        recordAiCallTraceImpl,
      },
    );

    expect(result.parser).toBe("mock");
    expect(recordAiCallTraceImpl).not.toHaveBeenCalled();
  });

  it("still resolves the user parse when the trace insert rejects asynchronously (issue #288)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recordAiCallTraceImpl = vi.fn(async () => {
      throw new Error("ai_call_traces insert exploded");
    });

    try {
      await expect(
        parseCaptureWithFallback(
          { rawText: "Email Taylor about launch notes" },
          {
            env: {
              OPENAI_API_KEY: "test-key",
              AI_MODEL_STANDARD: "standard-model",
            },
            parseCaptureImpl: vi.fn(async () => aiResponse),
            traceContext: { accessToken: "user-a-access-token" },
            recordAiCallTraceImpl,
          },
        ),
      ).resolves.toMatchObject({ parser: "ai", response: aiResponse });

      // Let the fire-and-forget rejection settle so the catch handler runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(recordAiCallTraceImpl).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("still resolves the user parse when the trace call throws synchronously (issue #288)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recordAiCallTraceImpl = vi.fn(() => {
      throw new Error("ai_call_traces synchronous failure");
    }) as unknown as typeof import("@/lib/observability").recordAiCallTrace;

    try {
      await expect(
        parseCaptureWithFallback(
          { rawText: "Email Taylor about launch notes" },
          {
            env: {
              OPENAI_API_KEY: "test-key",
              AI_MODEL_STANDARD: "standard-model",
            },
            parseCaptureImpl: vi.fn(async () => aiResponse),
            traceContext: { accessToken: "user-a-access-token" },
            recordAiCallTraceImpl,
          },
        ),
      ).resolves.toMatchObject({ parser: "ai", response: aiResponse });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("ai_call_traces"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
