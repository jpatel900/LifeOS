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
    for (const [name, fixture] of Object.entries(parseCaptureRegressionFixtures)) {
      const result = ParseCaptureResponseSchema.safeParse(fixture);
      expect(result.success, `fixture failed schema validation: ${name}`).toBe(true);
      expect(validateParseCaptureResponse(fixture)).toEqual(fixture);
    }
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
    expect(parsed.triageReasons).toContain("Overall confidence is below threshold.");
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

