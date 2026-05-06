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
