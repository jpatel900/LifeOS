/**
 * Golden capture eval harness (issue #287).
 *
 * Gates prompt/schema changes on the core AI surface (capture -> drafts ->
 * ambiguity) with structural-property assertions per docs/TEST_PLAN.md
 * section 8: never exact wording, always structure. Runs fully offline with
 * recorded model outputs — no API keys required.
 *
 * Guardrail: never weaken these assertions to make a prompt change pass.
 * A failing golden case requires either a prompt fix or an owner-approved
 * golden-set update documented in the PR.
 */
import { describe, expect, it, vi } from "vitest";
import type { CaptureItem } from "@lifeos/schemas";
import { ParseCaptureResponseSchema } from "@lifeos/schemas";
import {
  PARSE_CAPTURE_SCHEMA_VERSION,
  parseCaptureResponseJsonSchema,
  validateParseCaptureResponse,
} from "./contracts/parseCapture";
import { PARSE_CAPTURE_PROMPT_VERSION } from "./prompts/parseCapturePrompt";
import { buildParseCaptureRequest, parseCapture } from "./parseCapture";
import { buildParsedWorkflowResult } from "./parseCaptureWorkflow";
import {
  GOLDEN_CAPTURE_CATEGORIES,
  goldenCaptureCases,
  type GoldenCaptureCase,
} from "./fixtures/goldenCaptures";

const persistedCapture: CaptureItem = {
  id: "550e8400-e29b-41d4-a716-446655440301",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  area_id: "550e8400-e29b-41d4-a716-446655440101",
  raw_text: "Golden capture fixture text",
  raw_audio_ref: null,
  capture_mode: "text",
  inferred_area_confidence: null,
  status: "new",
  created_at: "2026-07-04T12:00:00.000Z",
};

function taskDraftsOf(goldenCase: GoldenCaptureCase) {
  return goldenCase.recordedResponse.drafts.filter(
    (draft) => draft.draft_type === "task_draft",
  );
}

function projectDraftsOf(goldenCase: GoldenCaptureCase) {
  return goldenCase.recordedResponse.drafts.filter(
    (draft) => draft.draft_type === "project_draft",
  );
}

describe("golden capture eval harness", () => {
  it("spans 15-30 cases covering the full capture taxonomy", () => {
    expect(goldenCaptureCases.length).toBeGreaterThanOrEqual(15);
    expect(goldenCaptureCases.length).toBeLessThanOrEqual(30);

    const coveredCategories = new Set(
      goldenCaptureCases.map((goldenCase) => goldenCase.category),
    );
    for (const category of GOLDEN_CAPTURE_CATEGORIES) {
      expect(
        coveredCategories.has(category),
        `taxonomy category has no golden case: ${category}`,
      ).toBe(true);
    }

    const ids = goldenCaptureCases.map((goldenCase) => goldenCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validates every recorded output against the strict response schema", () => {
    for (const goldenCase of goldenCaptureCases) {
      const result = ParseCaptureResponseSchema.safeParse(
        goldenCase.recordedResponse,
      );
      expect(
        result.success,
        `recorded output failed schema validation: ${goldenCase.id}`,
      ).toBe(true);
      expect(validateParseCaptureResponse(goldenCase.recordedResponse)).toEqual(
        goldenCase.recordedResponse,
      );
      expect(goldenCase.recordedResponse.schema_version).toBe(
        PARSE_CAPTURE_SCHEMA_VERSION,
      );
      expect(goldenCase.recordedResponse.prompt_version).toBe(
        PARSE_CAPTURE_PROMPT_VERSION,
      );
    }
  });

  it("replays every recorded output through the real parse pipeline offline", async () => {
    for (const goldenCase of goldenCaptureCases) {
      const fetchImpl = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify(goldenCase.recordedResponse),
        }),
      })) as unknown as typeof fetch;

      await expect(
        parseCapture(
          { rawText: goldenCase.rawText },
          {
            apiKey: "test-key",
            model: "golden-eval-model",
            fetchImpl,
          },
        ),
        `pipeline replay failed: ${goldenCase.id}`,
      ).resolves.toEqual(goldenCase.recordedResponse);
    }
  });

  it("meets the expected structural outcome for every golden case", () => {
    for (const goldenCase of goldenCaptureCases) {
      const { recordedResponse: response, expected, id } = goldenCase;

      expect(
        expected.allowedParseStatuses,
        `parse_status "${response.parse_status}" not allowed: ${id}`,
      ).toContain(response.parse_status);

      expect(response.triage_required, `triage_required mismatch: ${id}`).toBe(
        expected.triageRequired,
      );

      expect(
        taskDraftsOf(goldenCase).length,
        `too few task drafts: ${id}`,
      ).toBeGreaterThanOrEqual(expected.minTaskDrafts);
      expect(
        projectDraftsOf(goldenCase).length,
        `too few project drafts: ${id}`,
      ).toBeGreaterThanOrEqual(expected.minProjectDrafts);

      // Confidence exists and is bounded for the response and every draft.
      expect(response.overall_confidence).toBeGreaterThanOrEqual(0);
      expect(response.overall_confidence).toBeLessThanOrEqual(1);
      for (const draft of response.drafts) {
        expect(
          draft.confidence,
          `draft confidence missing: ${id}`,
        ).toBeGreaterThanOrEqual(0);
        expect(draft.confidence).toBeLessThanOrEqual(1);
      }

      if (expected.requiresClarificationQuestion) {
        expect(
          response.clarification_questions.length,
          `expected a clarification question: ${id}`,
        ).toBeGreaterThan(0);
      }

      if (!expected.allowsExactDueDate) {
        for (const draft of taskDraftsOf(goldenCase)) {
          expect(
            draft.due_at,
            `fabricated exact timeline for vague work: ${id}`,
          ).toBeNull();
        }
      }
    }
  });

  it("exposes unknowns, a first move, what-not-to-do-yet, and a review trigger for ambiguous work", () => {
    for (const goldenCase of goldenCaptureCases) {
      const { recordedResponse: response, expected, id } = goldenCase;

      if (!expected.ambiguity) {
        continue;
      }

      const assessment = response.ambiguity_assessment;
      expect(assessment, `missing ambiguity assessment: ${id}`).not.toBeNull();
      if (!assessment) {
        continue;
      }

      expect(
        expected.ambiguity.problemTypes,
        `problem_type "${assessment.problem_type}" not allowed: ${id}`,
      ).toContain(assessment.problem_type);
      expect(
        expected.ambiguity.complexityLevels,
        `complexity_level "${assessment.complexity_level}" not allowed: ${id}`,
      ).toContain(assessment.complexity_level);

      expect(
        assessment.unknowns.length,
        `ambiguous work must expose unknowns: ${id}`,
      ).toBeGreaterThan(0);
      expect(
        assessment.recommended_first_move,
        `ambiguous work needs a first move: ${id}`,
      ).toBeTruthy();
      expect(
        assessment.what_not_to_do_yet.length,
        `ambiguous work needs what-not-to-do-yet guidance: ${id}`,
      ).toBeGreaterThan(0);
      expect(
        assessment.review_trigger,
        `ambiguous work needs a review trigger: ${id}`,
      ).toBeTruthy();
      expect(assessment.confidence).toBeGreaterThanOrEqual(0);
      expect(assessment.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("never produces fake exact estimates for unclear-complexity work", () => {
    for (const goldenCase of goldenCaptureCases) {
      const { recordedResponse: response, id } = goldenCase;
      const isUnclear =
        response.ambiguity_assessment?.complexity_level === "unclear";

      for (const draft of taskDraftsOf(goldenCase)) {
        if (isUnclear) {
          expect(
            draft.estimated_minutes_low,
            `unclear work must not carry point estimates: ${id}`,
          ).toBeNull();
          expect(draft.estimated_minutes_high).toBeNull();
          expect(draft.due_at).toBeNull();
        } else if (
          draft.estimated_minutes_low !== null &&
          draft.estimated_minutes_high !== null
        ) {
          // Estimates must be ranges, not inverted point guesses.
          expect(
            draft.estimated_minutes_low,
            `estimate range inverted: ${id}`,
          ).toBeLessThanOrEqual(draft.estimated_minutes_high);
        }
      }
    }
  });

  it("carries at least one clarification question whenever clarification is the status", () => {
    for (const goldenCase of goldenCaptureCases) {
      const { recordedResponse: response, id } = goldenCase;
      if (
        response.parse_status === "needs_clarification" ||
        response.parse_status === "low_confidence"
      ) {
        expect(
          response.clarification_questions.length,
          `clarification status without a question: ${id}`,
        ).toBeGreaterThan(0);
        expect(
          response.triage_required,
          `clarification status must route to triage: ${id}`,
        ).toBe(true);
      }
    }
  });

  it("routes every golden case to the expected workflow status", () => {
    for (const goldenCase of goldenCaptureCases) {
      const parsed = buildParsedWorkflowResult({
        response: goldenCase.recordedResponse,
        capture: persistedCapture,
        workflowAreaId: "area-main-job",
      });

      expect(
        parsed.captureItem.status,
        `workflow routing mismatch: ${goldenCase.id}`,
      ).toBe(goldenCase.expected.triageRequired ? "triage_required" : "parsed");

      if (goldenCase.expected.ambiguity) {
        expect(
          parsed.ambiguityAssessment,
          `workflow dropped the ambiguity assessment: ${goldenCase.id}`,
        ).not.toBeNull();
        expect(
          parsed.ambiguityAssessment?.unknowns.length ?? 0,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("builds a strict schema-bound request preserving every raw capture as data", () => {
    for (const goldenCase of goldenCaptureCases) {
      const request = buildParseCaptureRequest({
        rawText: goldenCase.rawText,
        model: "golden-eval-model",
      });

      // Prompt/response contract: strict structured output, no storage.
      expect(request.store).toBe(false);
      expect(request.text.format.strict).toBe(true);
      expect(request.text.format.schema).toEqual(
        parseCaptureResponseJsonSchema,
      );

      const systemMessage = request.input.find(
        (message) => message.role === "system",
      );
      const userMessage = request.input.find(
        (message) => message.role === "user",
      );
      expect(
        systemMessage,
        `system message missing: ${goldenCase.id}`,
      ).toBeDefined();
      expect(
        userMessage,
        `user message missing: ${goldenCase.id}`,
      ).toBeDefined();

      // Version pinning stays in the system prompt.
      expect(systemMessage?.content).toContain(PARSE_CAPTURE_SCHEMA_VERSION);
      expect(systemMessage?.content).toContain(PARSE_CAPTURE_PROMPT_VERSION);

      // Injection guard: captured text is data, never instructions, and no
      // external action may be claimed as completed.
      expect(systemMessage?.content).toMatch(/data, not instructions/i);
      expect(systemMessage?.content).toMatch(
        /never claim external actions were completed/i,
      );

      // The raw capture must reach the model verbatim as user data.
      expect(
        userMessage?.content,
        `raw capture text missing from request: ${goldenCase.id}`,
      ).toContain(goldenCase.rawText);
    }
  });
});
