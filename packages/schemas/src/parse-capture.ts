import { z } from "zod";

/**
 * AI response for capture parsing (REQUIREMENTS FR-005 + AGENTS.md).
 * Drafts are suggestions until accepted through triage — not persisted rows verbatim.
 */
export const ParseCaptureTaskDraftSchema = z.object({
  draft_type: z.literal("task_draft"),
  title: z.string().min(1),
  description: z.string().optional(),
  area_slug_suggestion: z.string().nullable(),
  first_tiny_step: z.string().nullable().optional(),
  estimated_minutes_low: z.number().int().positive().nullable().optional(),
  estimated_minutes_high: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export const ParseCaptureProjectDraftSchema = z.object({
  draft_type: z.literal("project_draft"),
  title: z.string().min(1),
  description: z.string().optional(),
  area_slug_suggestion: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export const ParseCaptureBlockerDraftSchema = z.object({
  draft_type: z.literal("blocker_draft"),
  title: z.string().min(1),
  description: z.string().optional(),
  blocked_subject_hint: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const ParseCaptureTimeBlockProposalDraftSchema = z.object({
  draft_type: z.literal("time_block_proposal_draft"),
  task_title_hint: z.string().optional(),
  suggested_start: z.string().datetime().optional(),
  suggested_end: z.string().datetime().optional(),
  rationale: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const ParseCaptureClarificationItemSchema = z.object({
  draft_type: z.literal("clarification_item"),
  question: z.string().min(1),
  why_it_matters: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

/** Embedded sense-making output shape before a full AmbiguityAssessment row exists. */
export const ParseCaptureAmbiguityAssessmentDraftSchema = z.object({
  draft_type: z.literal("ambiguity_assessment"),
  likely_objective: z.string(),
  problem_type: z.string().optional(),
  complexity_level: z.string().optional(),
  knowns: z.array(z.string()).default([]),
  unknowns: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  recommended_first_move: z.string(),
  what_not_to_do_yet: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  review_trigger: z.string().optional(),
});

export const ParseCaptureDraftSchema = z.discriminatedUnion("draft_type", [
  ParseCaptureTaskDraftSchema,
  ParseCaptureProjectDraftSchema,
  ParseCaptureBlockerDraftSchema,
  ParseCaptureTimeBlockProposalDraftSchema,
  ParseCaptureClarificationItemSchema,
  ParseCaptureAmbiguityAssessmentDraftSchema,
]);

export type ParseCaptureDraft = z.infer<typeof ParseCaptureDraftSchema>;

export const ParseCaptureResponseSchema = z.object({
  schema_version: z.literal("1.0"),
  prompt_version: z.string().min(1),
  drafts: z.array(ParseCaptureDraftSchema),
  /** Human-readable parsing caveats; distinct from clarification_item drafts. */
  ambiguities: z.array(z.string()),
});

export type ParseCaptureResponse = z.infer<typeof ParseCaptureResponseSchema>;
