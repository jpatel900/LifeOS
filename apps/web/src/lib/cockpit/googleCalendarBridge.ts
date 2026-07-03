/**
 * Client-safe helpers for the cockpit's Google Calendar approval bridge.
 *
 * Mirrors the server-side LifeOS-owned event id shape enforced in
 * `apps/web/src/lib/googleCalendar/events.ts` (`isLifeOsOwnedGoogleEventId`)
 * without importing that server-only module into client bundles.
 */
const LIFEOS_OWNED_GOOGLE_EVENT_ID_SHAPE = /^lifeos[0-9a-f]{32}$/;

export function isLifeOsOwnedGoogleEventIdShape(
  eventId: string | null | undefined,
): eventId is string {
  return (
    typeof eventId === "string" &&
    LIFEOS_OWNED_GOOGLE_EVENT_ID_SHAPE.test(eventId)
  );
}
