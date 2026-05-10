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
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

interface CheckGoogleCalendarFreeBusyForConnectionParams {
  connection: GoogleCalendarStoredConnection;
  proposedEnd: string;
  proposedStart: string;
  supabaseAccessToken: string;
}

export interface GoogleCalendarFreeBusyCheckResult {
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

export async function checkGoogleCalendarFreeBusyForConnection(
  params: CheckGoogleCalendarFreeBusyForConnectionParams,
): Promise<GoogleCalendarFreeBusyCheckResult> {
  assertServerRuntime();

  const accessToken = await resolveGoogleCalendarAccessToken(params);
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

  return {
    checkedAt: new Date().toISOString(),
    hasConflict: busyItems.length > 0,
  };
}
