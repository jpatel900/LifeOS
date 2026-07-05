import { describe, expect, it, vi } from "vitest";
import type { CaptureItem } from "@lifeos/schemas";
import { ParseCaptureResponseSchema } from "@lifeos/schemas";
import { validateParseCaptureResponse } from "./contracts/parseCapture";
import { parseCapture } from "./parseCapture";
import { buildParsedWorkflowResult } from "./parseCaptureWorkflow";
import { parseCaptureRegressionFixtures } from "./fixtures/parseCaptureFixtures";

const persistedCapture: CaptureItem = {
  id: "550e8400-e29b-41d4-a716-446655440201",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  raw_text: "Regression fixture capture text",
  raw_audio_ref: null,
  capture_mode: "text",
  inferred_area_confidence: null,
  status: "new",
  created_at: "2026-05-08T12:00:00.000Z",
};

describe("parse capture regression fixtures", () => {
  it("validates all regression fixtures against ParseCaptureResponseSchema", () => {
    for (const [name, fixture] of Object.entries(
      parseCaptureRegressionFixtures,
    )) {
      const result = ParseCaptureResponseSchema.safeParse(fixture);
      expect(result.success, `fixture failed schema validation: ${name}`).toBe(
        true,
      );
      expect(validateParseCaptureResponse(fixture)).toEqual(fixture);
    }
  });

  it("extracts a committed_to person and flags a commitment for promise phrasings", () => {
    const fixture = parseCaptureRegressionFixtures.commitmentToSarah;
    const taskDraft = fixture.drafts.find(
      (draft) => draft.draft_type === "task_draft",
    );
    expect(taskDraft?.is_commitment).toBe(true);
    expect(
      taskDraft?.person_mentions.some(
        (mention) =>
          mention.role === "committed_to" && mention.name === "Sarah",
      ),
    ).toBe(true);
  });

  it("keeps an ambiguous person mention low-confidence and non-committing", () => {
    const fixture = parseCaptureRegressionFixtures.ambiguousPersonName;
    const taskDraft = fixture.drafts.find(
      (draft) => draft.draft_type === "task_draft",
    );
    expect(taskDraft?.is_commitment).toBe(false);
    const mention = taskDraft?.person_mentions[0];
    expect(mention?.confidence).toBeLessThan(0.5);
  });

  it("degrades a person-free capture to a plain task with no mentions", () => {
    const fixture = parseCaptureRegressionFixtures.noPersonCapture;
    const taskDraft = fixture.drafts.find(
      (draft) => draft.draft_type === "task_draft",
    );
    expect(taskDraft?.is_commitment).toBe(false);
    expect(taskDraft?.person_mentions).toEqual([]);
  });

  it("applies person-mention defaults when the model omits the S3 fields", () => {
    const parsed = ParseCaptureResponseSchema.parse({
      schema_version: "1.0",
      prompt_version: "parse_capture.v3",
      parse_status: "parsed",
      overall_confidence: 0.9,
      triage_required: false,
      triage_reasons: [],
      drafts: [
        {
          draft_type: "task_draft",
          title: "Legacy draft without S3 fields",
          description: null,
          area_slug_suggestion: null,
          first_tiny_step: null,
          estimated_minutes_low: null,
          estimated_minutes_high: null,
          due_at: null,
          confidence: 0.9,
        },
      ],
      clarification_questions: [],
      ambiguity_assessment: null,
    });
    const taskDraft = parsed.drafts.find(
      (draft) => draft.draft_type === "task_draft",
    );
    expect(taskDraft?.person_mentions).toEqual([]);
    expect(taskDraft?.is_commitment).toBe(false);
  });

  it("routes low-confidence output to triage", () => {
    const lowConfidence = parseCaptureRegressionFixtures.lowConfidenceOutput;
    const parsed = buildParsedWorkflowResult({
      response: lowConfidence,
      capture: persistedCapture,
      workflowAreaId: "area-main-job",
    });

    expect(parsed.captureItem.status).toBe("triage_required");
    expect(parsed.captureItem.inferred_area_confidence).toBe(0.39);
    expect(parsed.triageReasons).toContain(
      "Overall confidence is below threshold.",
    );
  });

  it("routes clarification-heavy output to triage", () => {
    const ambiguous = parseCaptureRegressionFixtures.ambiguousProject;
    const parsed = buildParsedWorkflowResult({
      response: ambiguous,
      capture: persistedCapture,
      workflowAreaId: "area-volunteer",
    });

    expect(parsed.captureItem.status).toBe("triage_required");
    expect(parsed.projectDrafts.length).toBeGreaterThan(0);
    expect(parsed.ambiguityAssessment?.likely_objective).toBeTruthy();
  });

  it("rejects invalid enum and invalid draft shape fixtures", () => {
    const invalidEnum = {
      ...parseCaptureRegressionFixtures.simpleTask,
      parse_status: "uncertain",
    };
    const invalidShape = {
      ...parseCaptureRegressionFixtures.simpleTask,
      drafts: [
        {
          draft_type: "task_draft",
          title: "Broken draft missing required fields",
          confidence: 0.7,
        },
      ],
    };

    expect(() => validateParseCaptureResponse(invalidEnum)).toThrow(
      /failed validation/i,
    );
    expect(() => validateParseCaptureResponse(invalidShape)).toThrow(
      /failed validation/i,
    );
  });

  it("parses mocked AI structured output offline for all fixtures", async () => {
    for (const fixture of Object.values(parseCaptureRegressionFixtures)) {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify(fixture),
        }),
      })) as unknown as typeof fetch;

      await expect(
        parseCapture(
          { rawText: "Any capture text for fixture replay." },
          {
            apiKey: "test-key",
            model: "standard-model",
            fetchImpl,
          },
        ),
      ).resolves.toEqual(fixture);
    }
  });
});
