import {
  buildGoogleAccessTokenExpiresAt,
  decryptGoogleCalendarToken,
  encryptGoogleCalendarToken,
} from "./tokens";
import { refreshGoogleCalendarAccessToken } from "./oauth";
import {
  type GoogleCalendarStoredConnection,
  upsertGoogleCalendarConnectionForAccessToken,
} from "./server";

const GOOGLE_CALENDAR_FREEBUSY_URL =
  "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_CALENDAR_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars";
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

interface CheckGoogleCalendarFreeBusyForConnectionParams {
  connection: GoogleCalendarStoredConnection;
  proposedEnd: string;
  proposedStart: string;
  supabaseAccessToken: string;
  timezone?: string;
}

export interface GoogleCalendarAllDayContext {
  date: string;
  endDate: string;
  id: string;
  summary: string;
}

export interface GoogleCalendarFreeBusyCheckResult {
  allDayContexts: GoogleCalendarAllDayContext[];
  checkedAt: string;
  hasConflict: boolean;
}

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Google Calendar free/busy helper must stay server-only.");
  }
}

function isAccessTokenExpired(tokenExpiresAt: string | null) {
  if (!tokenExpiresAt) {
    return true;
  }

  const expiresAt = new Date(tokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return expiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS;
}

export async function resolveGoogleCalendarAccessToken(params: {
  connection: GoogleCalendarStoredConnection;
  supabaseAccessToken: string;
}) {
  const { connection, supabaseAccessToken } = params;

  if (
    connection.encrypted_access_token &&
    !isAccessTokenExpired(connection.token_expires_at)
  ) {
    return decryptGoogleCalendarToken(connection.encrypted_access_token);
  }

  if (!connection.encrypted_refresh_token) {
    throw new Error("Google Calendar refresh token is unavailable.");
  }

  const refreshToken = decryptGoogleCalendarToken(
    connection.encrypted_refresh_token,
  );
  const refreshed = await refreshGoogleCalendarAccessToken({ refreshToken });
  const encryptedAccessToken = encryptGoogleCalendarToken(
    refreshed.accessToken,
  );
  const encryptedRefreshToken = refreshed.refreshToken
    ? encryptGoogleCalendarToken(refreshed.refreshToken)
    : connection.encrypted_refresh_token;

  await upsertGoogleCalendarConnectionForAccessToken(supabaseAccessToken, {
    calendar_id: connection.calendar_id,
    connected_at: connection.connected_at,
    disconnected_at: null,
    encrypted_access_token: encryptedAccessToken,
    encrypted_refresh_token: encryptedRefreshToken,
    granted_scopes_json:
      refreshed.scope ??
      (Array.isArray(connection.granted_scopes_json)
        ? connection.granted_scopes_json
        : []),
    status: "connected",
    token_expires_at: buildGoogleAccessTokenExpiresAt(refreshed.expiresIn),
    token_type: refreshed.tokenType,
    user_id: connection.user_id,
  });

  return refreshed.accessToken;
}

function extractBusyItems(payload: unknown, calendarId: string) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Google Calendar free/busy returned an invalid payload.");
  }

  const calendars = (payload as Record<string, unknown>).calendars;

  if (!calendars || typeof calendars !== "object") {
    throw new Error("Google Calendar free/busy returned no calendar data.");
  }

  const calendar =
    (calendars as Record<string, unknown>)[calendarId] ??
    (calendars as Record<string, unknown>).primary;

  if (!calendar || typeof calendar !== "object") {
    throw new Error("Google Calendar free/busy did not include the calendar.");
  }

  const busy = (calendar as Record<string, unknown>).busy;

  if (!Array.isArray(busy)) {
    throw new Error("Google Calendar free/busy busy window data is invalid.");
  }

  return busy;
}

function getCalendarDateKey(value: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const parts = formatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Google Calendar timezone date conversion failed.");
  }

  return `${year}-${month}-${day}`;
}

function addUtcDateDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function allDayContextOverlapsProposal(
  context: GoogleCalendarAllDayContext,
  proposedStart: string,
  proposedEnd: string,
  timezone: string,
) {
  const proposalStartDate = getCalendarDateKey(proposedStart, timezone);
  const proposalEndDate = getCalendarDateKey(proposedEnd, timezone);
  const proposalExclusiveEnd = addUtcDateDays(proposalEndDate, 1);

  return (
    context.date < proposalExclusiveEnd && context.endDate > proposalStartDate
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function extractAllDayContexts(
  payload: unknown,
  proposedStart: string,
  proposedEnd: string,
  timezone: string,
): GoogleCalendarAllDayContext[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];

  return payload.items
    .map((item) => {
      if (!isRecord(item) || !isRecord(item.start) || !isRecord(item.end)) {
        return null;
      }
      const startDate = item.start.date;
      const endDate = item.end.date;
      if (typeof startDate !== "string" || typeof endDate !== "string") {
        return null;
      }
      const context = {
        date: startDate,
        endDate,
        id: typeof item.id === "string" ? item.id : `${startDate}:${endDate}`,
        summary:
          typeof item.summary === "string" && item.summary.trim()
            ? item.summary.trim()
            : "Untitled all-day event",
      };
      return allDayContextOverlapsProposal(
        context,
        proposedStart,
        proposedEnd,
        timezone,
      )
        ? context
        : null;
    })
    .filter((item): item is GoogleCalendarAllDayContext => Boolean(item));
}

// Busy windows that cannot be parsed count as conflicts so a malformed
// provider response can never silently double-book the user.
function busyWindowOverlapsProposal(
  item: unknown,
  proposedStart: string,
  proposedEnd: string,
) {
  if (
    !isRecord(item) ||
    typeof item.start !== "string" ||
    typeof item.end !== "string"
  ) {
    return true;
  }

  const busyStart = new Date(item.start).getTime();
  const busyEnd = new Date(item.end).getTime();
  const windowStart = new Date(proposedStart).getTime();
  const windowEnd = new Date(proposedEnd).getTime();

  if (
    [busyStart, busyEnd, windowStart, windowEnd].some((value) =>
      Number.isNaN(value),
    )
  ) {
    return true;
  }

  return busyStart < windowEnd && busyEnd > windowStart;
}

async function fetchAllDayContexts(params: {
  accessToken: string;
  calendarId: string;
  proposedEnd: string;
  proposedStart: string;
  timezone: string;
}) {
  const eventsUrl = new URL(
    `${GOOGLE_CALENDAR_EVENTS_URL}/${encodeURIComponent(params.calendarId)}/events`,
  );
  eventsUrl.searchParams.set("singleEvents", "true");
  eventsUrl.searchParams.set("timeMin", params.proposedStart);
  eventsUrl.searchParams.set("timeMax", params.proposedEnd);
  eventsUrl.searchParams.set("timeZone", params.timezone);
  eventsUrl.searchParams.set("fields", "items(id,summary,start,end)");

  const response = await fetch(eventsUrl, {
    headers: { Authorization: `Bearer ${params.accessToken}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error("Google Calendar all-day event context failed.");
  }

  return extractAllDayContexts(
    payload,
    params.proposedStart,
    params.proposedEnd,
    params.timezone,
  );
}

export async function checkGoogleCalendarFreeBusyForConnection(
  params: CheckGoogleCalendarFreeBusyForConnectionParams,
): Promise<GoogleCalendarFreeBusyCheckResult> {
  assertServerRuntime();

  const accessToken = await resolveGoogleCalendarAccessToken(params);
  const timezone = params.timezone ?? "UTC";
  const response = await fetch(GOOGLE_CALENDAR_FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: params.proposedStart,
      timeMax: params.proposedEnd,
      items: [{ id: params.connection.calendar_id }],
    }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error("Google Calendar free/busy failed.");
  }

  const busyItems = extractBusyItems(payload, params.connection.calendar_id);
  const allDayContexts = await fetchAllDayContexts({
    accessToken,
    calendarId: params.connection.calendar_id,
    proposedEnd: params.proposedEnd,
    proposedStart: params.proposedStart,
    timezone,
  });
  const conflictingBusyItems = busyItems.filter((item) =>
    busyWindowOverlapsProposal(item, params.proposedStart, params.proposedEnd),
  );

  return {
    allDayContexts,
    checkedAt: new Date().toISOString(),
    hasConflict: conflictingBusyItems.length > 0,
  };
}
