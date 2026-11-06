import { z } from "zod";

/** Minimal auth user shape for app typing (not full DATA_MODEL table). */
export const UserSchema = z.object({
  id: z.guid(),
  email: z.string().email(),
  created_at: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;
