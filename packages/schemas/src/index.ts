import { z } from "zod";
import { CaptureItemSchema, type CaptureItem } from "./entities";

export * from "./constants";
export * from "./json";
export * from "./entities";
export * from "./parse-capture";
export * from "./user";
export * from "./model-tier";

export const CreateCaptureItemInputSchema = z.object({
  raw_text: z.string().trim().min(1),
  area_id: z.string().uuid().nullable(),
});

export type CreateCaptureItemInput = z.infer<
  typeof CreateCaptureItemInputSchema
>;

export const CaptureSchema = CaptureItemSchema;
export type Capture = CaptureItem;
<<<<<<< HEAD
export * from "./constants";
export * from "./json";
export * from "./entities";
export * from "./parse-capture";
export * from "./user";
export * from "./model-tier";
=======
import { z } from "zod";

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
  capture_mode: z.enum(["text", "audio", "import"]),
  inferred_area_confidence: z.number().min(0).max(1).nullable(),
  status: z.enum(["new", "parsed", "triage_required", "resolved", "archived"]),
  created_at: z.string().datetime(),
});

export type CaptureItem = z.infer<typeof CaptureItemSchema>;

export const CreateCaptureItemInputSchema = z.object({
  raw_text: z.string().trim().min(1),
  area_id: z.string().uuid().nullable(),
});

export type CreateCaptureItemInput = z.infer<
  typeof CreateCaptureItemInputSchema
>;

export const CaptureSchema = CaptureItemSchema;
export type Capture = CaptureItem;

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
>>>>>>> 12a4bc5 (Persist areas and captures with Supabase)
