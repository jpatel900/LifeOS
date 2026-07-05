import { z } from "zod";
import { JsonValueSchema } from "./json";

export const META_LEARNING_EVENT_SCHEMA_VERSION = "meta-learning-event-v1";
export const META_LEARNING_EVENT_SCHEMA_VERSION_V2 = "meta-learning-event-v2";

const MetaLearningEventSchemaVersionSchema = z.enum([
  META_LEARNING_EVENT_SCHEMA_VERSION,
  META_LEARNING_EVENT_SCHEMA_VERSION_V2,
]);

export const SuggestionRecordTypeSchema = z.enum([
  "parse_result",
  "triage_suggestion",
  "time_block_proposal",
  // FR-028 (F-G2b): deterministic re-entry auto-deferral events. Additive —
  // the DB column is free text with a not-blank check; this enum is the
  // client-side vocabulary gate.
  "re_entry_defer",
]);

export const SuggestionRecordStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "ignored",
  "expired",
]);

export const OverrideRecordTypeSchema = z.enum([
  "accepted",
  "edited",
  "rejected",
  "replaced",
]);

export const PolicyIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    "Policy identifiers must be stable lowercase keys.",
  );

export const SuggestionRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  policy_identifier: PolicyIdentifierSchema,
  schema_version: MetaLearningEventSchemaVersionSchema,
  suggestion_type: SuggestionRecordTypeSchema,
  subject_type: z.string().min(1),
  subject_id: z.string().uuid().nullable(),
  suggestion_json: JsonValueSchema,
  confidence: z.number().min(0).max(1).nullable(),
  status: SuggestionRecordStatusSchema,
  resolution_reason: z.string().trim().min(1).nullable(),
  decided_by: z.enum(["user", "system"]),
  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
});

export type SuggestionRecord = z.infer<typeof SuggestionRecordSchema>;

export const CreateSuggestionRecordInputSchema = z.object({
  area_id: z.string().uuid().nullable(),
  policy_identifier: PolicyIdentifierSchema,
  suggestion_type: SuggestionRecordTypeSchema,
  subject_type: z.string().trim().min(1),
  subject_id: z.string().uuid().nullable().optional(),
  suggestion_json: JsonValueSchema.default({}),
  confidence: z.number().min(0).max(1).nullable().optional(),
  status: SuggestionRecordStatusSchema.optional().default("pending"),
  resolved_at: z.string().datetime().nullable().optional(),
  resolution_reason: z.string().trim().min(1).nullable().optional(),
  decided_by: z.enum(["user", "system"]).optional().default("user"),
});

export type CreateSuggestionRecordInput = z.input<
  typeof CreateSuggestionRecordInputSchema
>;

export const OverrideRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  policy_identifier: PolicyIdentifierSchema,
  schema_version: MetaLearningEventSchemaVersionSchema,
  suggestion_id: z.string().uuid().nullable(),
  subject_type: z.string().min(1),
  subject_id: z.string().uuid(),
  override_type: OverrideRecordTypeSchema,
  old_value_json: JsonValueSchema,
  new_value_json: JsonValueSchema,
  reason: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type OverrideRecord = z.infer<typeof OverrideRecordSchema>;

export const CreateOverrideRecordInputSchema = z.object({
  area_id: z.string().uuid().nullable(),
  policy_identifier: PolicyIdentifierSchema,
  suggestion_id: z.string().uuid().nullable().optional(),
  subject_type: z.string().trim().min(1),
  subject_id: z.string().uuid(),
  override_type: OverrideRecordTypeSchema,
  old_value_json: JsonValueSchema.default({}),
  new_value_json: JsonValueSchema.default({}),
  reason: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export type CreateOverrideRecordInput = z.input<
  typeof CreateOverrideRecordInputSchema
>;
