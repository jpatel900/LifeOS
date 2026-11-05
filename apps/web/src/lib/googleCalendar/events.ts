import type { GoogleCalendarStoredConnection } from "./server";
import { resolveGoogleCalendarAccessToken } from "./freebusy";

interface GoogleCalendarEventReadParams {
  connection: GoogleCalendarStoredConnection;
  eventId: string;
  providerAccessToken?: string;
  supabaseAccessToken: string;
}

interface InsertGoogleCalendarEventParams {
  connection: GoogleCalendarStoredConnection;
  description: string | null;
  proposalId: string;
  proposedEnd: string;
  proposedStart: string;
  /**
   * Google access token already resolved by the caller. The approval route
   * resolves it BEFORE reserving the approval, so a sign-in refresh failure
   * (no request ever reached Google) never leaves a durable reservation.
   */
  providerAccessToken?: string;
  supabaseAccessToken: string;
  timezone: string;
  title: string;
}

/** Resolve (refreshing if needed) the Google token for a calendar write. */
export function resolveGoogleCalendarWriteAccessToken(params: {
  connection: GoogleCalendarStoredConnection;
  supabaseAccessToken: string;
}): Promise<string> {
  assertServerRuntime();
  return resolveGoogleCalendarAccessToken(params);
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

/**
 * Google answered the insert with a definitive client error (4xx other than
 * 409). The request was refused, so no event exists. Timeouts, network
 * errors and 5xx stay plain errors: Google may have created the event.
 */
export class GoogleCalendarInsertRejectedError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Google Calendar event insert failed.");
    this.name = "GoogleCalendarInsertRejectedError";
    this.status = status;
  }
}

/**
 * W3-16 #2: an earlier approval already created this proposal's event, but
 * it no longer matches the approval: it was moved or cancelled on Google, or
 * is gone. The event exists or existed, so this is NOT proof that Google
 * holds nothing; it only means LifeOS must not confirm the approved time.
 */
export class GoogleCalendarExistingEventMismatchError extends Error {
  constructor() {
    super("The Google Calendar event no longer matches this approval.");
    this.name = "GoogleCalendarExistingEventMismatchError";
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

/**
 * Ask Google whether a proposal's deterministic event is gone from the
 * connected calendar: not found, or a cancelled tombstone. Read errors throw,
 * so an unknown answer never counts as "gone".
 */
export async function isProposalEventGoneFromGoogle(params: {
  connection: GoogleCalendarStoredConnection;
  proposalId: string;
  providerAccessToken?: string;
  supabaseAccessToken: string;
}): Promise<boolean> {
  const read = await getGoogleCalendarEventForConnection({
    connection: params.connection,
    eventId: buildDeterministicGoogleEventId(params.proposalId),
    providerAccessToken: params.providerAccessToken,
    supabaseAccessToken: params.supabaseAccessToken,
  });
  return !read.exists || read.status === "cancelled";
}

export async function getGoogleCalendarEventForConnection(
  params: GoogleCalendarEventReadParams,
): Promise<GoogleCalendarEventReadResult> {
  assertServerRuntime();

  const accessToken =
    params.providerAccessToken ??
    (await resolveGoogleCalendarAccessToken({
      connection: params.connection,
      supabaseAccessToken: params.supabaseAccessToken,
    }));
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

function readEventDateTime(
  payload: Record<string, unknown> | null,
  key: "start" | "end",
) {
  const value = payload?.[key];
  if (!value || typeof value !== "object") return null;
  const dateTime = (value as Record<string, unknown>).dateTime;
  return typeof dateTime === "string" ? dateTime : null;
}

function isSameInstant(actual: string | null, expected: string) {
  if (actual === null) return false;
  const actualMs = Date.parse(actual);
  return !Number.isNaN(actualMs) && actualMs === Date.parse(expected);
}

/**
 * Read the event an earlier approval already created (insert answered 409)
 * and return it only if it still matches this approval: not cancelled,
 * carrying this proposal's id, at the approved start and end. Anything else
 * throws `GoogleCalendarExistingEventMismatchError`, so the caller never
 * records a time Google no longer holds.
 */
async function confirmExistingApprovedEvent(params: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  proposalId: string;
  proposedStart: string;
  proposedEnd: string;
}): Promise<InsertGoogleCalendarEventResult> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${params.calendarId}/events/${encodeURIComponent(params.eventId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      cache: "no-store",
    },
  );

  if (response.status === 404 || response.status === 410) {
    throw new GoogleCalendarExistingEventMismatchError();
  }

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new Error("Google Calendar event read failed.");
  }

  if (
    readEventStatus(payload) === "cancelled" ||
    readPrivateExtendedProperty(payload, "lifeos_proposal_id") !==
      params.proposalId ||
    !isSameInstant(readEventDateTime(payload, "start"), params.proposedStart) ||
    !isSameInstant(readEventDateTime(payload, "end"), params.proposedEnd)
  ) {
    throw new GoogleCalendarExistingEventMismatchError();
  }

  return {
    googleEventId: params.eventId,
    googleEventEtag: readEtag(payload),
    eventSnapshot: payload,
  };
}

export async function insertGoogleCalendarEventForConnection(
  params: InsertGoogleCalendarEventParams,
): Promise<InsertGoogleCalendarEventResult> {
  assertServerRuntime();

  const eventId = buildDeterministicGoogleEventId(params.proposalId);
  const accessToken =
    params.providerAccessToken ??
    (await resolveGoogleCalendarAccessToken({
      connection: params.connection,
      supabaseAccessToken: params.supabaseAccessToken,
    }));
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
    // W3-16 #2: the deterministic id already exists, so an earlier approval
    // created this event. It is only this approval's event if it still holds
    // the approved time. Read it before anything is recorded: it may have
    // been moved or cancelled on Google since.
    return confirmExistingApprovedEvent({
      accessToken,
      calendarId,
      eventId,
      proposalId: params.proposalId,
      proposedStart: params.proposedStart,
      proposedEnd: params.proposedEnd,
    });
  }

  if (response.status >= 400 && response.status < 500) {
    throw new GoogleCalendarInsertRejectedError(response.status);
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
