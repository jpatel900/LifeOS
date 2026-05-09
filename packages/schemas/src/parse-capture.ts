import { z } from "zod";

/**
 * AI response for capture parsing (REQUIREMENTS FR-005 + AGENTS.md).
 * Drafts are suggestions until accepted through triage — not persisted rows verbatim.
 */
export const ParseCaptureTaskDraftSchema = z.object({
  draft_type: z.literal("task_draft"),
  title: z.string().min(1),
  description: z.string().nullable(),
  area_slug_suggestion: z.string().nullable(),
  first_tiny_step: z.string().nullable(),
  estimated_minutes_low: z.number().int().positive().nullable(),
  estimated_minutes_high: z.number().int().positive().nullable(),
  due_at: z.string().datetime().nullable(),
  confidence: z.number().min(0).max(1),
});

export const ParseCaptureProjectDraftSchema = z.object({
  draft_type: z.literal("project_draft"),
  title: z.string().min(1),
  description: z.string().nullable(),
  area_slug_suggestion: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const ParseCaptureAmbiguityAssessmentSchema = z.object({
  likely_objective: z.string().nullable(),
  problem_type: z.enum(["task", "project", "decision", "unknown"]),
  complexity_level: z.enum(["simple", "moderate", "complex", "unclear"]),
  knowns: z.array(z.string()),
  unknowns: z.array(z.string()),
  assumptions: z.array(z.string()),
  constraints: z.array(z.string()),
  risks: z.array(z.string()),
  dependencies: z.array(z.string()),
  recommended_first_move: z.string().nullable(),
  what_not_to_do_yet: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  review_trigger: z.string().nullable(),
});

export const ParseCaptureDraftSchema = z.discriminatedUnion("draft_type", [
  ParseCaptureTaskDraftSchema,
  ParseCaptureProjectDraftSchema,
]);

export type ParseCaptureDraft = z.infer<typeof ParseCaptureDraftSchema>;

export const ParseCaptureResponseSchema = z.object({
  schema_version: z.literal("1.0"),
  prompt_version: z.string().min(1),
  parse_status: z.enum(["parsed", "needs_clarification", "unsupported", "low_confidence"]),
  overall_confidence: z.number().min(0).max(1),
  triage_required: z.boolean(),
  triage_reasons: z.array(z.string()),
  drafts: z.array(ParseCaptureDraftSchema),
  clarification_questions: z.array(z.string()),
  ambiguity_assessment: ParseCaptureAmbiguityAssessmentSchema.nullable(),
});

export type ParseCaptureResponse = z.infer<typeof ParseCaptureResponseSchema>;
