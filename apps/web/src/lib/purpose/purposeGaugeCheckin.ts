import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import {
  shouldOfferPurposeGauge,
  type PurposeGaugeResponse,
} from "./purposeGaugePolicy";

/**
 * FR-047 slice 2 / FR-033 (#686) — Close-moment purpose-gauge check-in
 * persistence + offer gating.
 *
 * The write path records ONE row per user per local day a check-in is
 * actually tapped (20260718150000_add_purpose_gauge_checkins), mirroring
 * lib/reEntry/briefView.ts's fire-and-forget contract: a persistence failure
 * must never surface to the operator or affect the Close ritual. A skipped or
 * declined offer calls nothing here — absence is never a signal (FR-033).
 *
 * The offer gate wraps the shipped `shouldOfferPurposeGauge` policy (imported
 * unchanged) with client-day authority and a local per-day suppression: the
 * caller supplies the local `now` and the last local day an offer was taken,
 * keeping all clock authority on the client per the NS surfaces convention.
 */

/** Local-calendar YYYY-MM-DD stamp (matches lib/reEntry/briefView.ts). */
export function localDayStamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * True when the Close moment should show the optional one-tap check-in:
 * a fixed FR-033 sample day AND no check-in already taken this local day.
 * Sanctuary context is the empty (never-excluded) context — the Close moment
 * is a whole-day surface with no per-item/area sanctuary mark; a
 * day-sanctuary predicate would fail this closed automatically. Delegates
 * every gate to the shared policy; never throws.
 */
export function shouldOfferPurposeGaugeCheckin(
  now: Date,
  lastCheckedDay: string | null,
): boolean {
  return shouldOfferPurposeGauge({
    localDayOfMonth: now.getDate(),
    alreadyOfferedToday: lastCheckedDay === localDayStamp(now),
    sanctuaryContext: {},
  });
}

interface PurposeGaugeCheckinQuery {
  upsert: (
    row: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean },
  ) => PromiseLike<{ error: unknown }>;
}

async function insertPurposeGaugeCheckin(
  client: MinimalSupabaseClient,
  checkedOn: string,
  response: PurposeGaugeResponse,
): Promise<void> {
  if (!client.auth) return;

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return;

  const query = client.from(
    "purpose_gauge_checkins",
  ) as PurposeGaugeCheckinQuery;

  // Idempotent by construction (brief_views / capture client_capture_id
  // precedent): the (user_id, checked_on) primary key means a re-tap on the
  // same local day is a silent no-op, never a thrown unique-violation and
  // never a revision of the first recorded response.
  await query.upsert(
    { user_id: userData.user.id, checked_on: checkedOn, response },
    { onConflict: "user_id,checked_on", ignoreDuplicates: true },
  );
}

/**
 * Fire-and-forget: never awaited by the caller, never throws into the Close
 * render path. `client === null` is demo/mock mode (no Supabase configured)
 * and is skipped silently — there is nothing to write to. Records ONLY the
 * three exact FR-033 responses; anything else is dropped without a write.
 */
export function recordPurposeGaugeCheckinFireAndForget(
  client: MinimalSupabaseClient | null,
  checkedOn: string,
  response: PurposeGaugeResponse,
): void {
  if (!client) return;

  void insertPurposeGaugeCheckin(client, checkedOn, response).catch(() => {
    // Check-in write is telemetry-adjacent; a failure here must never
    // surface to the operator or affect the Close ritual it sits inside.
  });
}
