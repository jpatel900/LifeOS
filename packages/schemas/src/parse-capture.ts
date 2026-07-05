import { z } from "zod";

/**
 * AI response for capture parsing (REQUIREMENTS FR-005 + AGENTS.md).
 * Drafts are suggestions until accepted through triage — not persisted rows verbatim.
 */
/**
 * Anti-procrastination breakdown: full scope as small ordered steps, the
 * dependency chain that defines the critical path, and one tiny kick-start
 * step. Designed to remove around-the-work thinking, not to schedule.
 */
export const ParseCaptureBreakdownStepSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1),
  estimated_minutes: z.number().int().positive().nullable(),
  depends_on_orders: z.array(z.number().int().min(1)),
  on_critical_path: z.boolean(),
});

export type ParseCaptureBreakdownStep = z.infer<
  typeof ParseCaptureBreakdownStepSchema
>;

export const ParseCaptureBreakdownSchema = z.object({
  steps: z.array(ParseCaptureBreakdownStepSchema).min(1),
  sequence_summary: z.string().nullable(),
  kickstart_step: z.string().min(1),
});

export type ParseCaptureBreakdown = z.infer<typeof ParseCaptureBreakdownSchema>;

/**
 * Stage 1 slice S3 (issue #255): person references detected in a capture.
 * `role` distinguishes who owes whom, matching the frozen DATA_MODEL 4.11
 * commitment columns: `waiting_on` (the user is waiting on this person),
 * `committed_to` (the user promised this person), or a plain `mention`.
 * Never persisted verbatim — a proposed link only resolves against `people`
 * (normalized_name) or proposes a new person after explicit user approval.
 */
export const ParseCapturePersonMentionRoleSchema = z.enum([
  "waiting_on",
  "committed_to",
  "mention",
]);

export type ParseCapturePersonMentionRole = z.infer<
  typeof ParseCapturePersonMentionRoleSchema
>;

export const ParseCapturePersonMentionSchema = z.object({
  name: z.string().min(1),
  role: ParseCapturePersonMentionRoleSchema,
  confidence: z.number().min(0).max(1),
});

export type ParseCapturePersonMention = z.infer<
  typeof ParseCapturePersonMentionSchema
>;

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
  breakdown: ParseCaptureBreakdownSchema.nullable().default(null),
  // S3 (#255): optional, additive. `person_mentions` is a (possibly empty)
  // array — "no person" is `[]`, not null — and `is_commitment` mirrors the
  // frozen `tasks.is_commitment boolean not null default false` DB column.
  // Both default so pre-S3 persisted parse results still validate (NS-INV-2).
  person_mentions: z
    .array(ParseCapturePersonMentionSchema)
    .default([]),
  is_commitment: z.boolean().default(false),
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
  parse_status: z.enum([
    "parsed",
    "needs_clarification",
    "unsupported",
    "low_confidence",
  ]),
  overall_confidence: z.number().min(0).max(1),
  triage_required: z.boolean(),
  triage_reasons: z.array(z.string()),
  drafts: z.array(ParseCaptureDraftSchema),
  clarification_questions: z.array(z.string()),
  ambiguity_assessment: ParseCaptureAmbiguityAssessmentSchema.nullable(),
});

export type ParseCaptureResponse = z.infer<typeof ParseCaptureResponseSchema>;
