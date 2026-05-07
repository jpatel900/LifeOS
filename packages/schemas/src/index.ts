import { z } from "zod";

export const CaptureSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  raw_text: z.string().min(1),
  status: z.enum(["raw", "parsed", "triaged", "archived"]),
  created_at: z.string().datetime(),
});

export type Capture = z.infer<typeof CaptureSchema>;

export const AreaSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  color: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type Area = z.infer<typeof AreaSchema>;

export const ParseCaptureResponseSchema = z.object({
  schema_version: z.literal("1.0"),
  items: z.array(
    z.object({
      type: z.enum(["task", "event", "note", "reference"]),
      title: z.string(),
      body: z.string().optional(),
      area_suggestion: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    })
  ),
  ambiguities: z.array(z.string()),
});

export type ParseCaptureResponse = z.infer<typeof ParseCaptureResponseSchema>;

export const CaptureItemSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  area_id: z.string().min(1).nullable(),
  raw_text: z.string().min(1),
  capture_mode: z.literal("text"),
  inferred_area_confidence: z.number().min(0).max(1).nullable(),
  status: z.enum(["new", "parsed", "triage_required", "resolved", "archived"]),
  created_at: z.string().datetime(),
});

export type CaptureItem = z.infer<typeof CaptureItemSchema>;

export const TaskDraftSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  capture_item_id: z.string().min(1),
  area_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  estimated_minutes_low: z.number().int().positive(),
  estimated_minutes_high: z.number().int().positive(),
  first_tiny_step: z.string().min(1),
  status: z.enum(["pending", "accepted", "rejected"]),
  created_at: z.string().datetime(),
});

export type TaskDraft = z.infer<typeof TaskDraftSchema>;

export const AmbiguityAssessmentResponseSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  area_id: z.string().min(1).nullable(),
  source_capture_item_id: z.string().min(1),
  likely_objective: z.string().min(1),
  possible_workstreams: z.array(z.string().min(1)),
  knowns: z.array(z.string().min(1)),
  unknowns: z.array(z.string().min(1)),
  assumptions: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)),
  dependencies: z.array(z.string().min(1)),
  recommended_first_move: z.string().min(1),
  what_not_to_do_yet: z.array(z.string().min(1)),
  confidence_score: z.number().min(0).max(1),
  review_trigger: z.string().min(1),
  created_at: z.string().datetime(),
});

export type AmbiguityAssessmentResponse = z.infer<
  typeof AmbiguityAssessmentResponseSchema
>;

export const TimeBlockProposalDraftSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  area_id: z.string().min(1),
  capture_item_id: z.string().min(1),
  task_draft_id: z.string().min(1),
  proposed_start: z.string().datetime(),
  proposed_end: z.string().datetime(),
  rationale: z.string().min(1),
  conflict_flag: z.boolean(),
  status: z.enum(["draft", "accepted", "rejected"]),
  created_at: z.string().datetime(),
});

export type TimeBlockProposalDraft = z.infer<typeof TimeBlockProposalDraftSchema>;

export const TimeBlockProposalSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  area_id: z.string().min(1),
  task_id: z.string().min(1),
  proposed_start: z.string().datetime(),
  proposed_end: z.string().datetime(),
  rationale: z.string().min(1),
  conflict_flag: z.boolean(),
  status: z.enum(["proposed", "edited", "accepted", "rejected"]),
  created_at: z.string().datetime(),
});

export type TimeBlockProposal = z.infer<typeof TimeBlockProposalSchema>;

export const MockParseCaptureResponseSchema = z.object({
  schema_version: z.literal("phase2.mock.v1"),
  captureItem: CaptureItemSchema,
  taskDraft: TaskDraftSchema,
  ambiguityAssessment: AmbiguityAssessmentResponseSchema,
  firstSuggestedAction: z.string().min(1),
  timeBlockProposalDraft: TimeBlockProposalDraftSchema,
});

export type MockParseCaptureResponse = z.infer<
  typeof MockParseCaptureResponseSchema
>;
