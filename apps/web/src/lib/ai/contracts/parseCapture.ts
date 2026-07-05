import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";

export const PARSE_CAPTURE_SCHEMA_VERSION = "1.0" as const;

type JsonSchema = Record<string, unknown>;

const breakdownStepSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    order: { type: "integer" },
    title: { type: "string" },
    estimated_minutes: { type: ["integer", "null"] },
    depends_on_orders: { type: "array", items: { type: "integer" } },
    on_critical_path: { type: "boolean" },
  },
  required: [
    "order",
    "title",
    "estimated_minutes",
    "depends_on_orders",
    "on_critical_path",
  ],
};

const breakdownSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    steps: { type: "array", items: breakdownStepSchema },
    sequence_summary: { type: ["string", "null"] },
    kickstart_step: { type: "string" },
  },
  required: ["steps", "sequence_summary", "kickstart_step"],
};

// S3 (#255): person references detected per draft. `role` mirrors the frozen
// DATA_MODEL commitment columns; "no person" is an empty array, not null.
const personMentionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    role: {
      type: "string",
      enum: ["waiting_on", "committed_to", "mention"],
    },
    confidence: { type: "number" },
  },
  required: ["name", "role", "confidence"],
};

const taskDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["task_draft"] },
    title: { type: "string" },
    description: { type: ["string", "null"] },
    area_slug_suggestion: { type: ["string", "null"] },
    first_tiny_step: { type: ["string", "null"] },
    estimated_minutes_low: { type: ["integer", "null"] },
    estimated_minutes_high: { type: ["integer", "null"] },
    due_at: { type: ["string", "null"], format: "date-time" },
    confidence: { type: "number" },
    breakdown: {
      anyOf: [breakdownSchema, { type: "null" }],
    },
    person_mentions: { type: "array", items: personMentionSchema },
    is_commitment: { type: "boolean" },
  },
  required: [
    "draft_type",
    "title",
    "description",
    "area_slug_suggestion",
    "first_tiny_step",
    "estimated_minutes_low",
    "estimated_minutes_high",
    "due_at",
    "confidence",
    "breakdown",
    "person_mentions",
    "is_commitment",
  ],
};

const projectDraftSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    draft_type: { type: "string", enum: ["project_draft"] },
    title: { type: "string" },
    description: { type: ["string", "null"] },
    area_slug_suggestion: { type: ["string", "null"] },
    confidence: { type: "number" },
  },
  required: [
    "draft_type",
    "title",
    "description",
    "area_slug_suggestion",
    "confidence",
  ],
};

const ambiguityAssessmentSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    likely_objective: { type: ["string", "null"] },
    problem_type: {
      type: "string",
      enum: ["task", "project", "decision", "unknown"],
    },
    complexity_level: {
      type: "string",
      enum: ["simple", "moderate", "complex", "unclear"],
    },
    knowns: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    dependencies: { type: "array", items: { type: "string" } },
    recommended_first_move: { type: ["string", "null"] },
    what_not_to_do_yet: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    review_trigger: { type: ["string", "null"] },
  },
  required: [
    "likely_objective",
    "problem_type",
    "complexity_level",
    "knowns",
    "unknowns",
    "assumptions",
    "constraints",
    "risks",
    "dependencies",
    "recommended_first_move",
    "what_not_to_do_yet",
    "confidence",
    "review_trigger",
  ],
};

export const parseCaptureResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schema_version: { type: "string", enum: [PARSE_CAPTURE_SCHEMA_VERSION] },
    prompt_version: { type: "string" },
    parse_status: {
      type: "string",
      enum: ["parsed", "needs_clarification", "unsupported", "low_confidence"],
    },
    overall_confidence: { type: "number" },
    triage_required: { type: "boolean" },
    triage_reasons: { type: "array", items: { type: "string" } },
    drafts: {
      type: "array",
      items: {
        anyOf: [taskDraftSchema, projectDraftSchema],
      },
    },
    clarification_questions: { type: "array", items: { type: "string" } },
    ambiguity_assessment: {
      anyOf: [ambiguityAssessmentSchema, { type: "null" }],
    },
  },
  required: [
    "schema_version",
    "prompt_version",
    "parse_status",
    "overall_confidence",
    "triage_required",
    "triage_reasons",
    "drafts",
    "clarification_questions",
    "ambiguity_assessment",
  ],
};

export const parseCaptureResponseFormat = {
  type: "json_schema",
  name: "parse_capture_response",
  description: "Structured draft objects extracted from one raw capture.",
  strict: true,
  schema: parseCaptureResponseJsonSchema,
} as const;

export function validateParseCaptureResponse(
  payload: unknown,
): ParseCaptureResponse {
  const result = ParseCaptureResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Parse capture response failed validation: ${result.error.message}`,
    );
  }

  return result.data;
}
