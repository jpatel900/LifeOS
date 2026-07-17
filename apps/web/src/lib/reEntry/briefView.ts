import type { MinimalSupabaseClient } from "@/lib/data/workflow";

/**
 * #292 Stage-2 entry gate instrumentation (gap finding, 2026-07-16 A2 runbook
 * comment): "brief viewed >= 4 days/week" had no instrumentation anywhere.
 * This is the smallest truthful write for it — one row per user per local
 * day the brief/re-entry surface renders, via 20260718120000_add_brief_views.
 *
 * Deliberately isolated from the reEntry read-model (summary.ts) and from
 * the deferral write path (defer.ts): this module records ONLY that the
 * surface rendered, never what it showed. It must never affect the ritual
 * it instruments — every call here is fire-and-forget and failure-silent,
 * mirroring recordReEntryDeferral / recordSuggestionFireAndForget's
 * "a learning-write failure must never affect the return ritual" contract.
 */

export function localDayStamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface BriefViewsQuery {
  upsert: (
    row: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) => PromiseLike<{ error: unknown }>;
}

async function insertBriefView(
  client: MinimalSupabaseClient,
  viewedOn: string,
): Promise<void> {
  if (!client.auth) return;

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return;

  const query = client.from("brief_views") as BriefViewsQuery;

  // Idempotent by construction (matches syncQueuedCapture's
  // client_capture_id precedent): the (user_id, viewed_on) primary key means
  // a replayed render on the same local day is a silent no-op, never a
  // thrown unique-violation.
  await query.upsert(
    { user_id: userData.user.id, viewed_on: viewedOn },
    { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
  );
}

/**
 * Fire-and-forget: never awaited by the caller, never throws into the
 * render path. `client === null` is demo/mock mode (no Supabase configured)
 * and is skipped silently — there is nothing to write to.
 */
export function recordBriefViewFireAndForget(
  client: MinimalSupabaseClient | null,
  viewedOn: string,
): void {
  if (!client) return;

  void insertBriefView(client, viewedOn).catch(() => {
    // Telemetry-only write; a failure here must never surface to the user
    // or affect the ritual it instruments.
  });
}

/**
 * Per-hook-instance "once per local day" gate. The (user_id, viewed_on)
 * primary key already makes a duplicate insert harmless, but this avoids
 * firing a redundant network call on every re-latch within the same day.
 */
export interface BriefViewRecorder {
  recordIfNeeded(client: MinimalSupabaseClient | null, now: Date): void;
}

export function createBriefViewRecorder(): BriefViewRecorder {
  let lastRecordedDay: string | null = null;

  return {
    recordIfNeeded(client, now) {
      const viewedOn = localDayStamp(now);
      if (lastRecordedDay === viewedOn) return;
      lastRecordedDay = viewedOn;
      recordBriefViewFireAndForget(client, viewedOn);
    },
  };
}
