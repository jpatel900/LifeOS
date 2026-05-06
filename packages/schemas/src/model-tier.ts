import { z } from "zod";

export const ModelTierSchema = z.enum([
  "AI_MODEL_CHEAP",
  "AI_MODEL_STANDARD",
  "AI_MODEL_STRONG",
]);

export type ModelTier = z.infer<typeof ModelTierSchema>;
