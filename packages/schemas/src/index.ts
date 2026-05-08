import { z } from "zod";
import { CaptureItemSchema, type CaptureItem } from "./entities";

export * from "./constants";
export * from "./json";
export * from "./entities";
export * from "./parse-capture";
export * from "./user";
export * from "./model-tier";
export * from "./phase2-mock-workflow";

export const CreateCaptureItemInputSchema = z.object({
  raw_text: z.string().trim().min(1),
  area_id: z.string().uuid().nullable(),
});

export type CreateCaptureItemInput = z.infer<
  typeof CreateCaptureItemInputSchema
>;

export const CaptureSchema = CaptureItemSchema;
export type Capture = CaptureItem;
