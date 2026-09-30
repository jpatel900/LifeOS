import type { RollupSummaryContent } from "@lifeos/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";

export function rollupReplaySummary(headline: string): RollupSummaryContent {
  return { highlights: [headline], misses: [], counts: {} };
}

// These append-only fixtures cannot clean up after themselves. Reserve dates
// beyond both the account's existing rows and this file's earlier reservations.
export function createFutureDateReservation() {
  const day = 86_400_000;
  let reservedThrough = Date.UTC(2080, 0, 1) - day;

  return async (
    clients: readonly SupabaseClient[],
    table: "brief_views" | "purpose_gauge_checkins",
    column: "viewed_on" | "checked_on",
  ): Promise<string> => {
    for (const client of clients) {
      const { data, error } = await client
        .from(table)
        .select(column)
        .order(column, { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(
          `Could not reserve a ${table} fixture date: ${error.message}`,
        );
      }
      const row: { viewed_on?: unknown; checked_on?: unknown } | undefined =
        data?.[0];
      const latest = row?.[column];
      if (typeof latest === "string") {
        reservedThrough = Math.max(
          reservedThrough,
          Date.parse(`${latest}T00:00:00.000Z`),
        );
      }
    }
    reservedThrough += day;
    return new Date(reservedThrough).toISOString().slice(0, 10);
  };
}
