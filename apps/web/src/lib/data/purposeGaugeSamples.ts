import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import type {
  MirrorPurposeResponse,
  MirrorPurposeSample,
} from "@/lib/mirror/mirrorTrendKernel";

/**
 * FR-047 slice 2 (#686) — read persisted purpose-gauge check-ins
 * (20260718150000_add_purpose_gauge_checkins) into the shape the Mirror trend
 * kernel consumes. Pure read + deterministic mapping; the kernel is untouched
 * and does all validation/exclusion. This module only shuttles rows across
 * the persistence seam.
 *
 * Import direction note: lib/data -> lib/mirror is a type-only import for the
 * sample shape. No lib/mirror -> lib/ai edge is created (the FR-047 "never
 * enters AI prompt context" criterion), so this seam is safe.
 */

const VALID_RESPONSES: ReadonlySet<string> = new Set([
  "lighter",
  "even",
  "heavier",
]);

interface PurposeGaugeCheckinRow {
  checked_on: string;
  response: string;
}

interface PurposeGaugeCheckinSelectQuery {
  select: (columns: string) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
}

/**
 * Deterministic row -> sample mapping. `sampledAtMs` is the UTC midnight of
 * the local check-in day (checked_on), so ordering is stable and clock-free.
 * `sanctuaryContext` is the empty (never-excluded) context: the Close moment
 * is a whole-day surface carrying no per-item/area sanctuary mark. Rows whose
 * response is not one of the three exact FR-033 values are dropped here; the
 * kernel would also drop them, but dropping at the seam keeps the fed set
 * honest.
 */
export function mapCheckinRowToSample(
  row: PurposeGaugeCheckinRow,
): MirrorPurposeSample | null {
  if (
    typeof row.checked_on !== "string" ||
    !VALID_RESPONSES.has(row.response)
  ) {
    return null;
  }

  const sampledAtMs = new Date(`${row.checked_on}T00:00:00Z`).getTime();
  if (!Number.isFinite(sampledAtMs)) {
    return null;
  }

  return {
    response: row.response as MirrorPurposeResponse,
    sampledAtMs,
    sanctuaryContext: {},
  };
}

/**
 * Read the signed-in user's persisted check-ins (RLS bounds the select to
 * the requesting user) and map them to Mirror samples. `client === null` is
 * demo/mock mode and yields no samples — the kernel then honestly reports the
 * calm insufficient-data state. Never throws: a read failure yields an empty
 * set (fail closed to "not enough data"), never a fabricated trend.
 */
export async function readPurposeGaugeSamples(
  client: MinimalSupabaseClient | null,
): Promise<MirrorPurposeSample[]> {
  if (!client) return [];

  try {
    const query = client.from(
      "purpose_gauge_checkins",
    ) as unknown as PurposeGaugeCheckinSelectQuery;
    const { data, error } = await query.select("checked_on,response");

    if (error || !Array.isArray(data)) return [];

    const samples: MirrorPurposeSample[] = [];
    for (const row of data) {
      const sample = mapCheckinRowToSample(row as PurposeGaugeCheckinRow);
      if (sample) samples.push(sample);
    }
    return samples;
  } catch {
    return [];
  }
}
