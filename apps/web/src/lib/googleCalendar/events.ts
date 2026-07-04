import type { GoogleCalendarStoredConnection } from "./server";
import { resolveGoogleCalendarAccessToken } from "./freebusy";

interface GoogleCalendarEventReadParams {
  connection: GoogleCalendarStoredConnection;
  eventId: string;
  supabaseAccessToken: string;
}

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
  googleEventEtag: string | null;
  eventSnapshot: Record<string, unknown> | null;
}

export interface GoogleCalendarEventReadResult {
  exists: boolean;
  googleEventId: string;
  googleEventEtag: string | null;
  lifeosProposalId: string | null;
  eventSnapshot: Record<string, unknown> | null;
  status: string | null;
}

interface DeleteGoogleCalendarEventParams {
  connection: GoogleCalendarStoredConnection;
  eventId: string;
  expectedEtag: string;
  supabaseAccessToken: string;
}

export type DeleteGoogleCalendarEventResult =
  | { status: "deleted" }
  | { status: "already_gone" };

export class GoogleCalendarMissingEtagError extends Error {
  constructor() {
    super("Google Calendar update/cancel requires an If-Match etag guard.");
    this.name = "GoogleCalendarMissingEtagError";
  }
}

export class GoogleCalendarEventDriftError extends Error {
  constructor() {
    super(
      "Google Calendar event changed since it was reviewed. Cancel was aborted; review the event and approve again.",
    );
    this.name = "GoogleCalendarEventDriftError";
  }
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

function readEtag(payload: Record<string, unknown> | null) {
  return typeof payload?.etag === "string" && payload.etag.trim()
    ? payload.etag
    : null;
}

function readEventStatus(payload: Record<string, unknown> | null) {
  return typeof payload?.status === "string" && payload.status.trim()
    ? payload.status
    : null;
}

function readPrivateExtendedProperty(
  payload: Record<string, unknown> | null,
  key: string,
) {
  const extendedProperties = payload?.extendedProperties;
  if (!extendedProperties || typeof extendedProperties !== "object") {
    return null;
  }

  const privateProperties = (extendedProperties as Record<string, unknown>)
    .private;
  if (!privateProperties || typeof privateProperties !== "object") {
    return null;
  }

  const value = (privateProperties as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function isLifeOsOwnedGoogleEventId(eventId: string) {
  return /^lifeos[0-9a-f]{32}$/.test(eventId);
}

function buildDeterministicGoogleEventId(proposalId: string) {
  const compactId = proposalId.replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(compactId)) {
    throw new Error("Google Calendar event insert requires a proposal UUID.");
  }

  return `lifeos${compactId}`;
}

export async function getGoogleCalendarEventForConnection(
  params: GoogleCalendarEventReadParams,
): Promise<GoogleCalendarEventReadResult> {
  assertServerRuntime();

  const accessToken = await resolveGoogleCalendarAccessToken({
    connection: params.connection,
    supabaseAccessToken: params.supabaseAccessToken,
  });
  const calendarId = encodeURIComponent(params.connection.calendar_id);
  const eventId = encodeURIComponent(params.eventId);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (response.status === 404 || response.status === 410) {
    return {
      exists: false,
      googleEventId: params.eventId,
      googleEventEtag: null,
      lifeosProposalId: null,
      eventSnapshot: null,
      status: null,
    };
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new Error("Google Calendar event read failed.");
  }

  return {
    exists: true,
    googleEventId: requireNonEmptyText(
      payload?.id,
      "Google Calendar event read returned no event id.",
    ),
    googleEventEtag: readEtag(payload),
    lifeosProposalId: readPrivateExtendedProperty(
      payload,
      "lifeos_proposal_id",
    ),
    eventSnapshot: payload,
    status: readEventStatus(payload),
  };
}

export async function insertGoogleCalendarEventForConnection(
  params: InsertGoogleCalendarEventParams,
): Promise<InsertGoogleCalendarEventResult> {
  assertServerRuntime();

  const eventId = buildDeterministicGoogleEventId(params.proposalId);
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
        id: eventId,
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
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (response.status === 409) {
    return {
      googleEventId: eventId,
      googleEventEtag: null,
      eventSnapshot: null,
    };
  }

  if (!response.ok) {
    throw new Error("Google Calendar event insert failed.");
  }

  return {
    googleEventId: requireNonEmptyText(
      payload?.id,
      "Google Calendar event insert returned no event id.",
    ),
    googleEventEtag: readEtag(payload),
    eventSnapshot: payload,
  };
}

export async function deleteGoogleCalendarEventForConnection(
  params: DeleteGoogleCalendarEventParams,
): Promise<DeleteGoogleCalendarEventResult> {
  assertServerRuntime();

  if (!isLifeOsOwnedGoogleEventId(params.eventId)) {
    throw new Error(
      "Only LifeOS-created Google Calendar events can be cancelled.",
    );
  }

  const accessToken = await resolveGoogleCalendarAccessToken({
    connection: params.connection,
    supabaseAccessToken: params.supabaseAccessToken,
  });
  const calendarId = encodeURIComponent(params.connection.calendar_id);
  const eventId = encodeURIComponent(params.eventId);
  if (!params.expectedEtag.trim()) {
    throw new GoogleCalendarMissingEtagError();
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "If-Match": params.expectedEtag,
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: "DELETE",
      headers,
      cache: "no-store",
    },
  );

  if (response.status === 404 || response.status === 410) {
    return { status: "already_gone" };
  }

  if (response.status === 412) {
    throw new GoogleCalendarEventDriftError();
  }

  if (!response.ok) {
    throw new Error("Google Calendar event delete failed.");
  }

  return { status: "deleted" };
}
