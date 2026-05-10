import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";
import { describe, expect, it, vi } from "vitest";
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

    expect(result).toEqual({ parser: "ai", response: aiResponse });
    expect(parseCaptureImpl).toHaveBeenCalledWith(
      { rawText: "Email Taylor about launch notes", areaContext: undefined },
      { apiKey: "test-key", model: "standard-model" },
    );
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

    expect(result).toEqual({ parser: "ai", response: aiResponse });
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
});
