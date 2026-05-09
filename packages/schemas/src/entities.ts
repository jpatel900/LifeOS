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
  energy_type: z.string().nullable(),
  estimated_minutes_low: z.number().int().nullable(),
  estimated_minutes_high: z.number().int().nullable(),
  due_at: z.string().datetime().nullable(),
  definition_of_done: z.string().nullable(),
  first_tiny_step: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

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
