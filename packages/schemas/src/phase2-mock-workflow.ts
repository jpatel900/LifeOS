import { z } from "zod";
import {
  ParseCaptureBreakdownSchema,
  ParseCapturePersonMentionSchema,
} from "./parse-capture";

/**
 * Phase 2 vertical-slice mock workflow types (local session state, non-UUID ids).
 * Kept separate from `entities.ts` DB row schemas to avoid conflating shapes.
 */
export const Phase2CaptureItemSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  area_id: z.string().min(1).nullable(),
  raw_text: z.string().min(1),
  capture_mode: z.literal("text"),
  inferred_area_confidence: z.number().min(0).max(1).nullable(),
  status: z.enum(["new", "parsed", "triage_required", "resolved", "archived"]),
  created_at: z.string().datetime(),
});

export type Phase2CaptureItem = z.infer<typeof Phase2CaptureItemSchema>;

export const Phase2TaskDraftSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  capture_item_id: z.string().min(1),
  area_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  estimated_minutes_low: z.number().int().positive().nullable(),
  estimated_minutes_high: z.number().int().positive().nullable(),
  first_tiny_step: z.string().min(1).nullable(),
  // Display-only staging copy of the parse-capture breakdown, carried through
  // untouched; never persisted to the tasks table (that schema change needs
  // separate human review).
  breakdown: ParseCaptureBreakdownSchema.nullable().default(null),
  // S3 (#255): display-only staging copy of the parse-capture person/commitment
  // signals, carried through so the triage UI can offer person-link approval.
  // Never persisted to `tasks` verbatim — a person link only lands after
  // explicit approval (NS-INV-4); an unmatched/rejected mention degrades the
  // task to a plain task and the raw capture is never lost.
  person_mentions: z.array(ParseCapturePersonMentionSchema).default([]),
  is_commitment: z.boolean().default(false),
  status: z.enum(["pending", "accepted", "rejected"]),
  created_at: z.string().datetime(),
});

export type Phase2TaskDraft = z.infer<typeof Phase2TaskDraftSchema>;

export const Phase2ProjectDraftSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  capture_item_id: z.string().min(1),
  area_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  status: z.enum(["pending", "accepted", "rejected"]),
  created_at: z.string().datetime(),
});

export type Phase2ProjectDraft = z.infer<typeof Phase2ProjectDraftSchema>;

export const Phase2AmbiguityAssessmentResponseSchema = z.object({
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

export type Phase2AmbiguityAssessmentResponse = z.infer<
  typeof Phase2AmbiguityAssessmentResponseSchema
>;

export const Phase2TimeBlockProposalDraftSchema = z.object({
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

export type Phase2TimeBlockProposalDraft = z.infer<
  typeof Phase2TimeBlockProposalDraftSchema
>;

export const Phase2TimeBlockProposalSchema = z.object({
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

export type Phase2TimeBlockProposal = z.infer<
  typeof Phase2TimeBlockProposalSchema
>;

export const MockParseCaptureResponseSchema = z.object({
  schema_version: z.literal("phase2.mock.v1"),
  captureItem: Phase2CaptureItemSchema,
  taskDraft: Phase2TaskDraftSchema,
  projectDraft: Phase2ProjectDraftSchema.nullable(),
  ambiguityAssessment: Phase2AmbiguityAssessmentResponseSchema,
  firstSuggestedAction: z.string().min(1),
  timeBlockProposalDraft: Phase2TimeBlockProposalDraftSchema,
});

export type MockParseCaptureResponse = z.infer<
  typeof MockParseCaptureResponseSchema
>;
