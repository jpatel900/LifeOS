export {
  CALENDAR_BLOCK_STATUSES,
  CAPTURE_ITEM_STATUSES,
  TASK_STATUSES,
  TIME_BLOCK_PROPOSAL_STATUSES,
} from "./constants";

import { z } from "zod";
import {
  AREA_CAPTURE_MODES,
  CALENDAR_BLOCK_STATUSES,
  CAPTURE_ITEM_STATUSES,
  EXECUTION_SESSION_OUTCOMES,
  EXTERNAL_WRITE_RESULT_STATUSES,
  GOOGLE_CALENDAR_CONNECTION_STATUSES,
  HEALTH_CHECK_STATUSES,
  PROJECT_STATUSES,
  REVIEW_TYPES,
  ROLLUP_PERIOD_TYPES,
  TASK_STATUSES,
  TIME_BLOCK_PROPOSAL_STATUSES,
} from "./constants";
import { JsonValueSchema } from "./json";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD");

export const AreaSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  // Stage 1 slice S2 (issue #254) additive columns. Marked optional so existing
  // area readers/fixtures that do not yet select or construct these columns keep
  // parsing and type-checking unchanged. The charter feeds the NS-INV-1
  // context-assembly module; the DB remains the source of truth (migration
  // enforces both columns nullable).
  charter_text: z.string().nullable().optional(),
  charter_updated_at: z.string().datetime().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Area = z.infer<typeof AreaSchema>;

export const CaptureItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  raw_text: z.string().min(1),
  raw_audio_ref: z.string().nullable(),
  capture_mode: z.enum(AREA_CAPTURE_MODES),
  inferred_area_confidence: z.number().min(0).max(1).nullable(),
  status: z.enum(CAPTURE_ITEM_STATUSES),
  created_at: z.string().datetime(),
});

export type CaptureItem = z.infer<typeof CaptureItemSchema>;

export const AmbiguityAssessmentSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  source_capture_item_id: z.string().uuid(),
  likely_objective: z.string(),
  problem_type: z.string(),
  complexity_level: z.string(),
  knowns_json: JsonValueSchema,
  unknowns_json: JsonValueSchema,
  assumptions_json: JsonValueSchema,
  constraints_json: JsonValueSchema,
  risks_json: JsonValueSchema,
  dependencies_json: JsonValueSchema,
  recommended_first_move: z.string(),
  what_not_to_do_yet_json: JsonValueSchema,
  confidence_score: z.number(),
  review_trigger: z.string(),
  created_at: z.string().datetime(),
});

export type AmbiguityAssessment = z.infer<typeof AmbiguityAssessmentSchema>;

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  source_capture_item_id: z.string().uuid().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  priority_score: z.number().nullable(),
  priority_confidence: z.number().min(0).max(1).nullable(),
  task_type: z.string().nullable(),
  is_reversible: z.boolean().nullable().optional(),
  energy_type: z.string().nullable(),
  estimated_minutes_low: z.number().int().nullable(),
  estimated_minutes_high: z.number().int().nullable(),
  due_at: z.string().datetime().nullable(),
  definition_of_done: z.string().nullable(),
  first_tiny_step: z.string().nullable(),
  // Stage 1 slice S1 (issue #253) additive columns. Marked optional so existing
  // task readers/fixtures that do not yet select or construct these columns
  // continue to parse and type-check unchanged (schema-only slice, zero
  // user-visible change). The DB remains the source of truth: the migration
  // enforces nullable FKs/timestamps and `is_commitment not null default false`.
  waiting_on_person_id: z.string().uuid().nullable().optional(),
  waiting_on_since: z.string().datetime().nullable().optional(),
  is_commitment: z.boolean().optional(),
  committed_to_person_id: z.string().uuid().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

export const PersonSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string().min(1),
  normalized_name: z.string().min(1),
  notes: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  archived_at: z.string().datetime().nullable(),
});

export type Person = z.infer<typeof PersonSchema>;

// Stage 1 slice S2 (issue #254). A single compensation rule pairs a named
// operator trait (e.g. "starting friction") with the rule that compensates for
// it (e.g. "require a concrete first move"). Frozen shape per DATA_MODEL 4.12:
// `compensation_rules` is a jsonb array of exactly `{ trait, rule }`.
export const CompensationRuleSchema = z.object({
  trait: z.string().min(1),
  rule: z.string().min(1),
});

export type CompensationRule = z.infer<typeof CompensationRuleSchema>;

// The single global operator profile per user (unique user_id). Consumed by the
// NS-INV-1 context-assembly module. Both text fields are nullable in the DB;
// `compensation_rules` is null when unset, otherwise a validated rule array.
export const OperatorProfileSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  profile_text: z.string().nullable(),
  compensation_rules: z.array(CompensationRuleSchema).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type OperatorProfile = z.infer<typeof OperatorProfileSchema>;

export const TimeBlockProposalSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  task_id: z.string().uuid().nullable(),
  proposed_start: z.string().datetime(),
  proposed_end: z.string().datetime(),
  rationale_json: JsonValueSchema,
  conflict_flag: z.boolean(),
  conflict_details_json: JsonValueSchema.nullable(),
  status: z.enum(TIME_BLOCK_PROPOSAL_STATUSES),
  created_at: z.string().datetime(),
});

export type TimeBlockProposal = z.infer<typeof TimeBlockProposalSchema>;

export const CalendarBlockSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  proposal_id: z.string().uuid().nullable(),
  task_id: z.string().uuid().nullable(),
  google_event_id: z.string().nullable(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  status: z.enum(CALENDAR_BLOCK_STATUSES),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type CalendarBlock = z.infer<typeof CalendarBlockSchema>;

export const ExecutionSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  task_id: z.string().uuid().nullable(),
  calendar_block_id: z.string().uuid().nullable(),
  planned_minutes: z.number().int().nullable(),
  actual_minutes: z.number().int().nullable(),
  paused_minutes: z.number().int().nullable(),
  distraction_minutes: z.number().int().nullable(),
  productivity_rating: z.number().int().nullable(),
  energy_rating: z.string().nullable(),
  outcome: z.enum(EXECUTION_SESSION_OUTCOMES),
  cap_outcome: z
    .enum(["cut_scope", "deferred"])
    .nullable()
    .optional()
    .default(null),
  notes: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type ExecutionSession = z.infer<typeof ExecutionSessionSchema>;

export const ReviewEntrySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  review_type: z.enum(REVIEW_TYPES),
  period_start: isoDate,
  period_end: isoDate,
  summary_json: JsonValueSchema,
  created_at: z.string().datetime(),
});

export type ReviewEntry = z.infer<typeof ReviewEntrySchema>;

export const WinRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  source_task_id: z.string().uuid().nullable(),
  source_project_id: z.string().uuid().nullable(),
  title: z.string().min(1),
  detail: z.string().nullable(),
  occurred_at: isoDate,
  review_entry_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
});

export type WinRecord = z.infer<typeof WinRecordSchema>;

// S8 (#260): the strict rollup summary content (DATA_MODEL §5.7 `summary`
// jsonb). Whether drafted by AI or composed deterministically from review
// data, an approved rollup always validates against this shape.
export const RollupSummaryContentSchema = z.object({
  highlights: z.array(z.string()),
  misses: z.array(z.string()),
  counts: z.record(z.string(), z.number()),
});

export type RollupSummaryContent = z.infer<typeof RollupSummaryContentSchema>;

export const RollupSummarySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid(),
  period_type: z.enum(ROLLUP_PERIOD_TYPES),
  period_start: isoDate,
  period_end: isoDate,
  summary: RollupSummaryContentSchema,
  created_at: z.string().datetime(),
});

export type RollupSummary = z.infer<typeof RollupSummarySchema>;

export const HealthCheckSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  subsystem: z.string().min(1),
  status: z.enum(HEALTH_CHECK_STATUSES),
  score: z.number().int(),
  details_json: JsonValueSchema,
  checked_at: z.string().datetime(),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const GoogleCalendarConnectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.literal("google_calendar"),
  calendar_id: z.string().min(1),
  granted_scopes_json: JsonValueSchema,
  status: z.enum(GOOGLE_CALENDAR_CONNECTION_STATUSES),
  first_write_warning_acknowledged_at: z.string().datetime().nullable(),
  connected_at: z.string().datetime().nullable(),
  disconnected_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type GoogleCalendarConnection = z.infer<
  typeof GoogleCalendarConnectionSchema
>;

export const ExternalWriteEventSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  provider: z.string().min(1),
  operation: z.string().min(1),
  target_type: z.string().min(1),
  target_id: z.string().nullable(),
  request_summary_json: JsonValueSchema,
  result_summary_json: JsonValueSchema,
  result_status: z.enum(EXTERNAL_WRITE_RESULT_STATUSES),
  error_message: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type ExternalWriteEvent = z.infer<typeof ExternalWriteEventSchema>;
