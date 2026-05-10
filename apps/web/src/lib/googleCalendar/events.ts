import type { GoogleCalendarStoredConnection } from "./server";
import { resolveGoogleCalendarAccessToken } from "./freebusy";

interface InsertGoogleCalendarEventParams {
  connection: GoogleCalendarStoredConnection;
  description: string | null;
  proposalId: string;
  proposedEnd: string;
  proposedStart: string;
  supabaseAccessToken: string;
  timezone: string;
  title: string;
}

export interface InsertGoogleCalendarEventResult {
  googleEventId: string;
}

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Google Calendar event helpers must stay server-only.");
  }
}

function requireNonEmptyText(value: unknown, message: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

export async function insertGoogleCalendarEventForConnection(
  params: InsertGoogleCalendarEventParams,
): Promise<InsertGoogleCalendarEventResult> {
  assertServerRuntime();

  const accessToken = await resolveGoogleCalendarAccessToken({
    connection: params.connection,
    supabaseAccessToken: params.supabaseAccessToken,
  });
  const calendarId = encodeURIComponent(params.connection.calendar_id);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: params.title,
        description: params.description ?? undefined,
        start: {
          dateTime: params.proposedStart,
          timeZone: params.timezone,
        },
        end: {
          dateTime: params.proposedEnd,
          timeZone: params.timezone,
        },
        eventType: "default",
        extendedProperties: {
          private: {
            lifeos_proposal_id: params.proposalId,
          },
        },
      }),
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  if (!response.ok) {
    throw new Error("Google Calendar event insert failed.");
  }

  return {
    googleEventId: requireNonEmptyText(
      payload?.id,
      "Google Calendar event insert returned no event id.",
    ),
  };
}
