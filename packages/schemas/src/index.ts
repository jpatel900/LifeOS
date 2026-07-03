import { z } from "zod";
import { CaptureItemSchema, type CaptureItem } from "./entities";
import { EXECUTION_SESSION_OUTCOMES, REVIEW_TYPES } from "./constants";
import { JsonValueSchema } from "./json";

export * from "./constants";
export * from "./json";
export * from "./entities";
export * from "./parse-capture";
export * from "./user";
export * from "./model-tier";
export * from "./meta-learning";
export * from "./phase2-mock-workflow";

export const CreateCaptureItemInputSchema = z.object({
  raw_text: z.string().trim().min(1),
  area_id: z.string().uuid().nullable(),
});

export type CreateCaptureItemInput = z.infer<
  typeof CreateCaptureItemInputSchema
>;

const nullableTrimmedText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

const optionalNullableTrimmedText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullish()
  .transform((value) => value ?? null);

export const CreateAreaInputSchema = z.object({
  name: z.string().trim().min(1),
  description: optionalNullableTrimmedText,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

export type CreateAreaInput = z.input<typeof CreateAreaInputSchema>;

export const SoftDeleteAreaInputSchema = z.object({
  area_id: z.string().uuid(),
});

export type SoftDeleteAreaInput = z.input<typeof SoftDeleteAreaInputSchema>;

export const UpdateAreaColorInputSchema = z.object({
  area_id: z.string().uuid(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
});

export type UpdateAreaColorInput = z.input<typeof UpdateAreaColorInputSchema>;

export const CreateProjectInputSchema = z.object({
  area_id: z.string().uuid(),
  title: z.string().trim().min(1),
  description: optionalNullableTrimmedText,
});

export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;

export const CreateTaskInputSchema = z
  .object({
    area_id: z.string().uuid(),
    project_id: z.string().uuid().nullable().optional(),
    source_capture_item_id: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(1),
    description: nullableTrimmedText,
    status: z.enum(["active", "backlog"]).optional().default("active"),
    priority_score: z.number().nullable().optional(),
    priority_confidence: z.number().min(0).max(1).nullable(),
    task_type: optionalNullableTrimmedText.optional(),
    energy_type: optionalNullableTrimmedText.optional(),
    estimated_minutes_low: z.number().int().positive().nullable(),
    estimated_minutes_high: z.number().int().positive().nullable(),
    due_at: z.string().datetime().nullable().optional(),
    definition_of_done: optionalNullableTrimmedText.optional(),
    first_tiny_step: nullableTrimmedText,
  })
  .refine(
    (input) =>
      input.estimated_minutes_low === null ||
      input.estimated_minutes_high === null ||
      input.estimated_minutes_high >= input.estimated_minutes_low,
    {
      message:
        "estimated_minutes_high must be greater than or equal to estimated_minutes_low",
      path: ["estimated_minutes_high"],
    },
  )
  .transform((input) => ({
    ...input,
    project_id: input.project_id ?? null,
    source_capture_item_id: input.source_capture_item_id ?? null,
    priority_score: input.priority_score ?? null,
    task_type: input.task_type ?? null,
    energy_type: input.energy_type ?? null,
    due_at: input.due_at ?? null,
    definition_of_done:
      input.definition_of_done ??
      "Complete the first useful move and note the outcome.",
  }));

export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

function endAfterStart(input: {
  proposed_start: string;
  proposed_end: string;
}) {
  return (
    new Date(input.proposed_end).getTime() >
    new Date(input.proposed_start).getTime()
  );
}

const proposalTimeRangeMessage = {
  message: "proposed_end must be after proposed_start",
  path: ["proposed_end"],
};

export const CreateTimeBlockProposalInputSchema = z
  .object({
    task_id: z.string().uuid(),
    proposed_start: z.string().datetime(),
    proposed_end: z.string().datetime(),
    rationale_note: z
      .string()
      .trim()
      .min(1)
      .optional()
      .default("Local planning proposal created from task duration."),
  })
  .refine(endAfterStart, proposalTimeRangeMessage);

export type CreateTimeBlockProposalInput = z.input<
  typeof CreateTimeBlockProposalInputSchema
>;

export const EditTimeBlockProposalInputSchema = z
  .object({
    proposed_start: z.string().datetime(),
    proposed_end: z.string().datetime(),
  })
  .refine(endAfterStart, proposalTimeRangeMessage);

export type EditTimeBlockProposalInput = z.input<
  typeof EditTimeBlockProposalInputSchema
>;

export const CheckTimeBlockProposalConflictInputSchema = z.object({
  proposal_id: z.string().uuid(),
});

export type CheckTimeBlockProposalConflictInput = z.input<
  typeof CheckTimeBlockProposalConflictInputSchema
>;

export const CreateGoogleCalendarEventInputSchema = z.object({
  proposal_id: z.string().uuid(),
  approved: z.literal(true),
  acknowledge_first_write_warning: z.boolean().optional().default(false),
  timezone: z.string().trim().min(1).default("UTC"),
});

export type CreateGoogleCalendarEventInput = z.input<
  typeof CreateGoogleCalendarEventInputSchema
>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD");

export const CreateExecutionSessionInputSchema = z.object({
  task_id: z.string().uuid(),
  calendar_block_id: z.string().uuid().nullable().optional(),
});

export type CreateExecutionSessionInput = z.input<
  typeof CreateExecutionSessionInputSchema
>;

export const MarkExecutionSessionInputSchema = z
  .object({
    status: z.enum(["completed", "missed", "distracted", "paused", "stuck"]),
    outcome: z
      .enum(EXECUTION_SESSION_OUTCOMES)
      .nullish()
      .transform((value) => value ?? null),
    actual_minutes: z
      .number()
      .int()
      .min(0)
      .nullish()
      .transform((value) => value ?? null),
    productivity_rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .nullish()
      .transform((value) => value ?? null),
    notes: optionalNullableTrimmedText,
  })
  .superRefine((input, context) => {
    if (input.status === "paused") {
      return;
    }

    if (input.outcome === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "outcome is required for terminal session updates",
        path: ["outcome"],
      });
    }

    if (input.actual_minutes === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "actual_minutes is required for terminal session updates",
        path: ["actual_minutes"],
      });
    }

    if (input.productivity_rating === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "productivity_rating is required for terminal session updates",
        path: ["productivity_rating"],
      });
    }
  });

export type MarkExecutionSessionInput = z.input<
  typeof MarkExecutionSessionInputSchema
>;

export const CreateReviewEntryInputSchema = z
  .object({
    area_id: z.string().uuid().nullable(),
    review_type: z.enum(REVIEW_TYPES),
    period_start: isoDate,
    period_end: isoDate,
    summary_json: JsonValueSchema,
  })
  .refine(
    (input) =>
      new Date(input.period_end).getTime() >=
      new Date(input.period_start).getTime(),
    {
      message: "period_end must be on or after period_start",
      path: ["period_end"],
    },
  );

export type CreateReviewEntryInput = z.input<
  typeof CreateReviewEntryInputSchema
>;

export const CaptureSchema = CaptureItemSchema;
export type Capture = CaptureItem;
