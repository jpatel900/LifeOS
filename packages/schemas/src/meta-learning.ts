import { z } from "zod";
import { JsonValueSchema } from "./json";

export const META_LEARNING_EVENT_SCHEMA_VERSION = "meta-learning-event-v1";

export const SuggestionRecordTypeSchema = z.enum([
  "parse_result",
  "triage_suggestion",
  "time_block_proposal",
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
  schema_version: z.literal(META_LEARNING_EVENT_SCHEMA_VERSION),
  suggestion_type: SuggestionRecordTypeSchema,
  subject_type: z.string().min(1),
  subject_id: z.string().uuid().nullable(),
  suggestion_json: JsonValueSchema,
  confidence: z.number().min(0).max(1).nullable(),
  status: SuggestionRecordStatusSchema,
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
});

export type CreateSuggestionRecordInput = z.input<
  typeof CreateSuggestionRecordInputSchema
>;

export const OverrideRecordSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  area_id: z.string().uuid().nullable(),
  policy_identifier: PolicyIdentifierSchema,
  schema_version: z.literal(META_LEARNING_EVENT_SCHEMA_VERSION),
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
