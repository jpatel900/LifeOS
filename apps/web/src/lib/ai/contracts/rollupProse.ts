/**
 * E3 (#260 follow-up) — the AI response contract for rollup-prose enhancement.
 *
 * The model returns ONLY rephrased highlight/miss strings. Counts never appear
 * here — they stay deterministic and authoritative (numbers must be real). The
 * service re-validates the item-set (same lengths, no empties) against the
 * source draft and falls back to the deterministic draft on any mismatch; this
 * contract only checks the shape.
 *
 * Validated by hand (not zod) — the shape is trivial and `apps/web` does not
 * depend on zod directly (schemas live in `@lifeos/schemas`).
 */

export const ROLLUP_PROSE_SCHEMA_VERSION = "1.0" as const;

export interface RollupProseResponse {
  highlights: string[];
  misses: string[];
}

type JsonSchema = Record<string, unknown>;

const rollupProseResponseJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    highlights: { type: "array", items: { type: "string" } },
    misses: { type: "array", items: { type: "string" } },
  },
  required: ["highlights", "misses"],
};

export const rollupProseResponseFormat = {
  type: "json_schema",
  name: "rollup_prose_response",
  description:
    "Rephrased highlight and miss items for one rollup. Same count and order as the input; counts are never included.",
  strict: true,
  schema: rollupProseResponseJsonSchema,
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateRollupProseResponse(
  payload: unknown,
): RollupProseResponse {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Rollup prose response must be an object.");
  }
  const record = payload as Record<string, unknown>;
  if (!isStringArray(record.highlights) || !isStringArray(record.misses)) {
    throw new Error(
      "Rollup prose response must have string[] highlights and misses.",
    );
  }
  return { highlights: record.highlights, misses: record.misses };
}
