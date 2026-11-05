import { localDayStamp } from "../time/localDay";
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

interface BriefViewsQuery {
  upsert: (
    row: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) => PromiseLike<{ error: unknown }>;
}

type RenderDay = {
  client: MinimalSupabaseClient;
  viewedOn: string;
  saved: Set<string>;
  pending: Map<string, { repeated: boolean }>;
};

function startDay(client: MinimalSupabaseClient, viewedOn: string): RenderDay {
  return { client, viewedOn, saved: new Set(), pending: new Map() };
}

async function trySave(day: RenderDay, userId: string): Promise<boolean> {
  try {
    const query = day.client.from("brief_views") as BriefViewsQuery;
    const { error } = await query.upsert(
      { user_id: userId, viewed_on: day.viewedOn },
      { onConflict: "user_id,viewed_on", ignoreDuplicates: true },
    );
    return error === null;
  } catch {
    return false;
  }
}

async function recordView(day: RenderDay, visitorId: string): Promise<void> {
  const { auth } = day.client;
  if (!auth || day.saved.has(visitorId)) return;
  const {
    data: { user },
    error,
  } = await auth.getUser();
  // Verification can finish after a switch. It may confirm the visitor, never replace them.
  if (error || user?.id !== visitorId || day.saved.has(visitorId)) return;

  // A second account has its own row, even while the first account's write is pending.
  const pending = day.pending.get(visitorId);
  if (pending) {
    pending.repeated = true;
    return;
  }
  const attempt = { repeated: false };
  day.pending.set(visitorId, attempt);
  do {
    attempt.repeated = false;
    if (await trySave(day, visitorId)) {
      day.saved.add(visitorId);
      break;
    }
    // Retry only when a real view arrived during the failed write.
  } while (attempt.repeated);
  day.pending.delete(visitorId);
}

function recordSilently(day: RenderDay, visitorId: string): void {
  void recordView(day, visitorId).catch(() => {
    // Auth failures must never interrupt the Start or re-entry surface.
  });
}

export function recordBriefViewFireAndForget(
  client: MinimalSupabaseClient | null,
  viewedOn: string,
  visitorId: string | null,
): void {
  if (client && visitorId)
    recordSilently(startDay(client, viewedOn), visitorId);
}

export interface BriefViewRecorder {
  recordIfNeeded(
    client: MinimalSupabaseClient | null,
    now: Date,
    visitorId: string | null,
  ): void;
}

export function createBriefViewRecorder(): BriefViewRecorder {
  let current: RenderDay | undefined;
  return {
    recordIfNeeded(client, now, visitorId) {
      if (!client || !visitorId) return;
      const viewedOn = localDayStamp(now);
      if (current?.client !== client || current.viewedOn !== viewedOn) {
        current = startDay(client, viewedOn);
      }
      recordSilently(current, visitorId);
    },
  };
}
