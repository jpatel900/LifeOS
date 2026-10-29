import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveGoogleCalendarAccessToken: vi.fn(),
}));

vi.mock("./freebusy", () => ({
  resolveGoogleCalendarAccessToken: mocks.resolveGoogleCalendarAccessToken,
}));

import {
  GoogleCalendarEventDriftError,
  GoogleCalendarInsertRejectedError,
  deleteGoogleCalendarEventForConnection,
  insertGoogleCalendarEventForConnection,
  recoverApprovedGoogleCalendarEventForConnection,
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

  it("treats a deterministic Google event id conflict as an idempotent insert result", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 409 } }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await insertGoogleCalendarEventForConnection({
      connection,
      description: null,
      proposalId: "550e8400-e29b-41d4-a716-446655440501",
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/Toronto",
      title: "Call dentist tomorrow",
    });

    expect(result.googleEventId).toBe("lifeos550e8400e29b41d4a716446655440501");
    expect(result.googleEventEtag).toBeNull();
    expect(result.eventSnapshot).toBeNull();
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

describe("Google Calendar original-identity recovery", () => {
  const proposalId = "550e8400-e29b-41d4-a716-446655440501";
  const eventId = "lifeos550e8400e29b41d4a716446655440501";
  const start = "2026-05-10T16:00:00.000Z";
  const end = "2026-05-10T17:00:00.000Z";
  const snapshot = {
    id: eventId,
    etag: '"verified"',
    status: "confirmed",
    start: { dateTime: start },
    end: { dateTime: end },
    extendedProperties: { private: { lifeos_proposal_id: proposalId } },
  };
  const beforeInsert = vi.fn();
  const params = {
    connection,
    description: null,
    proposalId,
    proposedStart: start,
    proposedEnd: end,
    supabaseAccessToken: "synthetic",
    timezone: "UTC",
    title: "Synthetic",
    beforeInsert,
  };
  const response = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mocks.resolveGoogleCalendarAccessToken.mockResolvedValue(
      "synthetic-provider-token",
    );
  });

  it("adopts the original verified event after a lost response without another POST", async () => {
    vi.mocked(fetch).mockResolvedValue(response(snapshot));
    expect(
      await recoverApprovedGoogleCalendarEventForConnection(params),
    ).toMatchObject({ googleEventId: eventId, googleEventEtag: '"verified"' });
    expect(beforeInsert).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it.each([200, 409])(
    "replays only the original ID and verifies readback after POST %s",
    async (status) => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(response({}, 404))
        .mockImplementationOnce(async () => {
          expect(beforeInsert).toHaveBeenCalledTimes(1);
          return response({ id: eventId }, status);
        })
        .mockResolvedValueOnce(response(snapshot));
      await expect(
        recoverApprovedGoogleCalendarEventForConnection(params),
      ).resolves.toMatchObject({ googleEventId: eventId });
      expect(
        vi.mocked(fetch).mock.calls.map((call) => call[1]?.method),
      ).toEqual(["GET", "POST", "GET"]);
      expect(
        JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).id,
      ).toBe(eventId);
      expect(mocks.resolveGoogleCalendarAccessToken).toHaveBeenCalledTimes(1);
    },
  );

  it("never POSTs when another request revokes the unsent reservation", async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, 404));
    beforeInsert.mockRejectedValue(new Error("revoked"));
    await expect(
      recoverApprovedGoogleCalendarEventForConnection(params),
    ).rejects.toThrow("revoked");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong ID", { ...snapshot, id: "unrelated" }],
    ["wrong marker", { ...snapshot, extendedProperties: {} }],
    [
      "moved time",
      { ...snapshot, start: { dateTime: "2026-05-10T18:00:00Z" } },
    ],
    ["cancelled", { ...snapshot, status: "cancelled" }],
    ["unknown status", { ...snapshot, status: "unknown" }],
    ["missing etag", { ...snapshot, etag: null }],
    ["all day", { ...snapshot, start: { date: "2026-05-10" } }],
    ["recurring", { ...snapshot, recurrence: ["RRULE:FREQ=DAILY"] }],
  ])(
    "preserves ambiguity for %s without another POST",
    async (_label, remote) => {
      vi.mocked(fetch).mockResolvedValue(response(remote));
      await expect(
        recoverApprovedGoogleCalendarEventForConnection(params),
      ).rejects.toThrow(/cannot be confirmed/);
      expect(beforeInsert).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([410, 503])("does not POST after GET %s", async (status) => {
    vi.mocked(fetch).mockResolvedValue(response({}, status));
    await expect(
      recoverApprovedGoogleCalendarEventForConnection(params),
    ).rejects.toThrow();
    expect(beforeInsert).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not finalize an opaque conflict followed by absence", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(response({}, 404));
    await expect(
      recoverApprovedGoogleCalendarEventForConnection(params),
    ).rejects.toThrow(/cannot be confirmed/);
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
