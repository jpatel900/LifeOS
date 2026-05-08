import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";

export const PARSE_CAPTURE_SCHEMA_VERSION = "1.0" as const;

type JsonSchema = Record<string, unknown>;

const taskDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["task_draft"] },
    title: { type: "string" },
    description: { type: "string" },
    area_slug_suggestion: { type: ["string", "null"] },
    first_tiny_step: { type: ["string", "null"] },
    estimated_minutes_low: { type: ["integer", "null"] },
    estimated_minutes_high: { type: ["integer", "null"] },
    confidence: { type: "number" },
  },
  required: [
    "draft_type",
    "title",
    "area_slug_suggestion",
    "confidence",
  ],
};

const projectDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["project_draft"] },
    title: { type: "string" },
    description: { type: "string" },
    area_slug_suggestion: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: [
    "draft_type",
    "title",
    "area_slug_suggestion",
    "confidence",
  ],
};

const blockerDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["blocker_draft"] },
    title: { type: "string" },
    description: { type: "string" },
    blocked_subject_hint: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["draft_type", "title", "confidence"],
};

const timeBlockProposalDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["time_block_proposal_draft"] },
    task_title_hint: { type: "string" },
    suggested_start: { type: "string", format: "date-time" },
    suggested_end: { type: "string", format: "date-time" },
    rationale: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["draft_type", "confidence"],
};

const clarificationItemSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["clarification_item"] },
    question: { type: "string" },
    why_it_matters: { type: "string" },
    confidence: { type: "number" },
  },
  required: ["draft_type", "question", "confidence"],
};

const ambiguityAssessmentDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["ambiguity_assessment"] },
    likely_objective: { type: "string" },
    problem_type: { type: "string" },
    complexity_level: { type: "string" },
    knowns: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    dependencies: { type: "array", items: { type: "string" } },
    recommended_first_move: { type: "string" },
    what_not_to_do_yet: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    review_trigger: { type: "string" },
  },
  required: [
    "draft_type",
    "likely_objective",
    "recommended_first_move",
    "confidence",
  ],
};

export const parseCaptureResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schema_version: { type: "string", enum: [PARSE_CAPTURE_SCHEMA_VERSION] },
    prompt_version: { type: "string" },
    drafts: {
      type: "array",
      items: {
        anyOf: [
          taskDraftSchema,
          projectDraftSchema,
          blockerDraftSchema,
          timeBlockProposalDraftSchema,
          clarificationItemSchema,
          ambiguityAssessmentDraftSchema,
        ],
      },
    },
    ambiguities: { type: "array", items: { type: "string" } },
  },
  required: ["schema_version", "prompt_version", "drafts", "ambiguities"],
};

export const parseCaptureResponseFormat = {
  type: "json_schema",
  name: "parse_capture_response",
  description: "Structured draft objects extracted from one raw capture.",
  strict: true,
  schema: parseCaptureResponseJsonSchema,
} as const;

export function validateParseCaptureResponse(payload: unknown): ParseCaptureResponse {
  const result = ParseCaptureResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Parse capture response failed validation: ${result.error.message}`);
  }

  return result.data;
}
