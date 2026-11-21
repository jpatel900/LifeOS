import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveGoogleCalendarAccessToken: vi.fn(),
}));

vi.mock("./freebusy", () => ({
  resolveGoogleCalendarAccessToken: mocks.resolveGoogleCalendarAccessToken,
}));

import {
  GoogleCalendarEventDriftError,
  GoogleCalendarExistingEventMismatchError,
  GoogleCalendarInsertRejectedError,
  deleteGoogleCalendarEventForConnection,
  insertGoogleCalendarEventForConnection,
  isProposalEventGoneFromGoogle,
} from "./events";

const connection = {
  id: "550e8400-e29b-41d4-a716-446655440901",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  provider: "google_calendar" as const,
  calendar_id: "primary",
  encrypted_access_token: "encrypted-google-access-token",
  encrypted_refresh_token: "encrypted-google-refresh-token",
  granted_scopes_json: [
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events.owned",
  ],
  status: "connected" as const,
  first_write_warning_acknowledged_at: "2026-05-09T00:00:00.000Z",
  connected_at: "2026-05-09T00:00:00.000Z",
  disconnected_at: null,
  token_expires_at: "2026-05-09T01:00:00.000Z",
  token_type: "Bearer",
  created_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
};

describe("Google Calendar event insert helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mocks.resolveGoogleCalendarAccessToken.mockResolvedValue(
      "google-access-token",
    );
  });

  it("checks absence with the already resolved token on the exact calendar", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    const gone = await isProposalEventGoneFromGoogle({
      connection: { ...connection, calendar_id: "synthetic calendar" },
      proposalId: "550e8400-e29b-41d4-a716-446655440501",
      supabaseAccessToken: "supabase-access-token",
      providerAccessToken: "fixed-provider-token",
    });
    expect(gone).toBe(true);
    expect(mocks.resolveGoogleCalendarAccessToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/synthetic%20calendar/events/lifeos550e8400e29b41d4a716446655440501",
      expect.objectContaining({
        headers: { Authorization: "Bearer fixed-provider-token" },
      }),
    );
  });

  it("maps a local proposal to a minimal Google Calendar event insert body", async () => {
    const proposalId = "550e8400-e29b-41d4-a716-446655440501";
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ id: "lifeos550e8400e29b41d4a716446655440501" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await insertGoogleCalendarEventForConnection({
      connection,
      description: "Created by LifeOS.",
      proposalId,
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/Toronto",
      title: "Call dentist tomorrow",
    });

    expect(result.googleEventId).toBe("lifeos550e8400e29b41d4a716446655440501");
    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer google-access-token",
        }),
      }),
    );

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      id: "lifeos550e8400e29b41d4a716446655440501",
      summary: "Call dentist tomorrow",
      description: "Created by LifeOS.",
      start: {
        dateTime: "2026-05-10T16:00:00.000Z",
        timeZone: "America/Toronto",
      },
      end: {
        dateTime: "2026-05-10T17:00:00.000Z",
        timeZone: "America/Toronto",
      },
      eventType: "default",
      extendedProperties: {
        private: {
          lifeos_proposal_id: proposalId,
        },
      },
    });
    expect(body.attendees).toBeUndefined();
    expect(body.conferenceData).toBeUndefined();
    expect(body.recurrence).toBeUndefined();
  });

  it("uses an access token resolved before the approval claim without refreshing again", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ id: "lifeos550e8400e29b41d4a716446655440501" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await insertGoogleCalendarEventForConnection({
      connection,
      description: null,
      proposalId: "550e8400-e29b-41d4-a716-446655440501",
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      providerAccessToken: "pre-resolved-google-token",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/Toronto",
      title: "Call dentist tomorrow",
    });

    expect(mocks.resolveGoogleCalendarAccessToken).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pre-resolved-google-token",
        }),
      }),
    );
  });

  it.each([400, 401, 403, 404, 429])(
    "marks a definitive Google %s insert rejection as proven not created",
    async (status) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify({ error: { code: status } }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
      const error = await insertGoogleCalendarEventForConnection({
        connection,
        description: null,
        proposalId: "550e8400-e29b-41d4-a716-446655440501",
        proposedEnd: "2026-05-10T17:00:00.000Z",
        proposedStart: "2026-05-10T16:00:00.000Z",
        supabaseAccessToken: "supabase-access-token",
        timezone: "America/Toronto",
        title: "Call dentist tomorrow",
      }).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(GoogleCalendarInsertRejectedError);
    },
  );

  it.each([
    ["not found", new Response("", { status: 404 }), true],
    [
      "a cancelled tombstone",
      new Response(
        JSON.stringify({
          id: "lifeos550e8400e29b41d4a716446655440599",
          status: "cancelled",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      true,
    ],
    [
      "a live event",
      new Response(
        JSON.stringify({
          id: "lifeos550e8400e29b41d4a716446655440599",
          status: "confirmed",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      false,
    ],
  ])(
    "reports a sibling event as gone from Google only for %s",
    async (_label, response, gone) => {
      vi.mocked(fetch).mockResolvedValue(response);
      await expect(
        isProposalEventGoneFromGoogle({
          connection,
          proposalId: "550e8400-e29b-41d4-a716-446655440599",
          supabaseAccessToken: "supabase-access-token",
        }),
      ).resolves.toBe(gone);
      expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain(
        "/events/lifeos550e8400e29b41d4a716446655440599",
      );
    },
  );

  it("keeps a Google 5xx insert failure ambiguous", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503 }));
    const error = await insertGoogleCalendarEventForConnection({
      connection,
      description: null,
      proposalId: "550e8400-e29b-41d4-a716-446655440501",
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/Toronto",
      title: "Call dentist tomorrow",
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(GoogleCalendarInsertRejectedError);
  });

  // W3-16 #2: a 409 for the deterministic id is idempotent ONLY after the
  // existing event is read and still matches the approval.
  function existingEvent(overrides: Record<string, unknown> = {}) {
    return {
      id: "lifeos550e8400e29b41d4a716446655440501",
      etag: '"etag-7"',
      status: "confirmed",
      start: { dateTime: "2026-05-10T12:00:00-04:00" },
      end: { dateTime: "2026-05-10T13:00:00-04:00" },
      extendedProperties: {
        private: { lifeos_proposal_id: "550e8400-e29b-41d4-a716-446655440501" },
      },
      ...overrides,
    };
  }

  function conflictThenRead(status: number, body: unknown) {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 409 } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );
  }

  const conflictInsert = {
    connection,
    description: null,
    proposalId: "550e8400-e29b-41d4-a716-446655440501",
    proposedEnd: "2026-05-10T17:00:00.000Z",
    proposedStart: "2026-05-10T16:00:00.000Z",
    supabaseAccessToken: "supabase-access-token",
    timezone: "America/Toronto",
    title: "Call dentist tomorrow",
  };

  it("treats a deterministic Google event id conflict as idempotent once the existing event still matches", async () => {
    // Same instants as the approval, written in another offset.
    conflictThenRead(200, existingEvent());

    const result = await insertGoogleCalendarEventForConnection(conflictInsert);

    expect(result.googleEventId).toBe("lifeos550e8400e29b41d4a716446655440501");
    expect(result.googleEventEtag).toBe('"etag-7"');
    expect(result.eventSnapshot).toMatchObject({ status: "confirmed" });
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/lifeos550e8400e29b41d4a716446655440501",
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
    });
  });

  it.each([
    [
      "moved",
      200,
      existingEvent({ start: { dateTime: "2026-05-10T19:00:00.000Z" } }),
    ],
    ["cancelled", 200, existingEvent({ status: "cancelled" })],
    [
      "another proposal's",
      200,
      existingEvent({ extendedProperties: { private: {} } }),
    ],
    ["gone", 404, { error: { code: 404 } }],
  ])(
    "refuses a conflict whose existing event is %s",
    async (_label, status, body) => {
      conflictThenRead(status, body);

      await expect(
        insertGoogleCalendarEventForConnection(conflictInsert),
      ).rejects.toBeInstanceOf(GoogleCalendarExistingEventMismatchError);
    },
  );

  it("a failed read of the existing event is a plain failure, never a confirmation", async () => {
    conflictThenRead(503, { error: { code: 503 } });

    const error = await insertGoogleCalendarEventForConnection(
      conflictInsert,
    ).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(GoogleCalendarExistingEventMismatchError);
  });

  it("captures the event etag and snapshot for provenance auditing", async () => {
    const proposalId = "550e8400-e29b-41d4-a716-446655440501";
    const snapshot = {
      id: "lifeos550e8400e29b41d4a716446655440501",
      etag: '"etag-42"',
      summary: "Call dentist tomorrow",
      extendedProperties: { private: { lifeos_proposal_id: proposalId } },
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await insertGoogleCalendarEventForConnection({
      connection,
      description: null,
      proposalId,
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/Toronto",
      title: "Call dentist tomorrow",
    });

    expect(result.googleEventEtag).toBe('"etag-42"');
    expect(result.eventSnapshot).toMatchObject({ etag: '"etag-42"' });
  });
});

describe("Google Calendar event delete helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mocks.resolveGoogleCalendarAccessToken.mockResolvedValue(
      "google-access-token",
    );
  });

  it("deletes an owned event with an If-Match drift guard", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteGoogleCalendarEventForConnection({
      connection,
      eventId: "lifeos550e8400e29b41d4a716446655440501",
      expectedEtag: '"etag-42"',
      supabaseAccessToken: "supabase-access-token",
    });

    expect(result.status).toBe("deleted");
    expect(fetch).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events/lifeos550e8400e29b41d4a716446655440501",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer google-access-token",
          "If-Match": '"etag-42"',
        }),
      }),
    );
  });

  it("refuses to delete events without the LifeOS-owned id shape", async () => {
    await expect(
      deleteGoogleCalendarEventForConnection({
        connection,
        eventId: "someone-elses-event",
        expectedEtag: "",
        supabaseAccessToken: "supabase-access-token",
      }),
    ).rejects.toThrow(/Only LifeOS-created/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("raises a drift error when the event changed since review", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 412 }));

    await expect(
      deleteGoogleCalendarEventForConnection({
        connection,
        eventId: "lifeos550e8400e29b41d4a716446655440501",
        expectedEtag: '"stale-etag"',
        supabaseAccessToken: "supabase-access-token",
      }),
    ).rejects.toThrow(GoogleCalendarEventDriftError);
  });

  it("treats an already-deleted event as already gone", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    const result = await deleteGoogleCalendarEventForConnection({
      connection,
      eventId: "lifeos550e8400e29b41d4a716446655440501",
      expectedEtag: '"etag-42"',
      supabaseAccessToken: "supabase-access-token",
    });

    expect(result.status).toBe("already_gone");
  });

  it("refuses to send a delete without an If-Match etag", async () => {
    await expect(
      deleteGoogleCalendarEventForConnection({
        connection,
        eventId: "lifeos550e8400e29b41d4a716446655440501",
        expectedEtag: "",
        supabaseAccessToken: "supabase-access-token",
      }),
    ).rejects.toThrow(/If-Match etag guard/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
