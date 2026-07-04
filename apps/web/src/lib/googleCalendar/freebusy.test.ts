import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildGoogleAccessTokenExpiresAt: vi.fn(),
  decryptGoogleCalendarToken: vi.fn(),
  encryptGoogleCalendarToken: vi.fn(),
  refreshGoogleCalendarAccessToken: vi.fn(),
  upsertGoogleCalendarConnectionForAccessToken: vi.fn(),
}));

vi.mock("./tokens", () => ({
  buildGoogleAccessTokenExpiresAt: mocks.buildGoogleAccessTokenExpiresAt,
  decryptGoogleCalendarToken: mocks.decryptGoogleCalendarToken,
  encryptGoogleCalendarToken: mocks.encryptGoogleCalendarToken,
}));

vi.mock("./oauth", async () => {
  const actual = await vi.importActual<typeof import("./oauth")>("./oauth");

  return {
    ...actual,
    refreshGoogleCalendarAccessToken: mocks.refreshGoogleCalendarAccessToken,
  };
});

vi.mock("./server", async () => {
  const actual = await vi.importActual<typeof import("./server")>("./server");

  return {
    ...actual,
    upsertGoogleCalendarConnectionForAccessToken:
      mocks.upsertGoogleCalendarConnectionForAccessToken,
  };
});

import {
  allDayContextOverlapsProposal,
  checkGoogleCalendarFreeBusyForConnection,
  extractAllDayContexts,
  getCalendarDateKey,
} from "./freebusy";

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
  first_write_warning_acknowledged_at: null,
  connected_at: "2026-05-09T00:00:00.000Z",
  disconnected_at: null,
  token_expires_at: "2026-05-09T00:00:00.000Z",
  token_type: "Bearer",
  created_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
};

describe("Google Calendar free/busy helper", () => {
  it("detects same-day all-day overlaps with exclusive-end semantics in the user's timezone", () => {
    const context = {
      date: "2026-07-01",
      endDate: "2026-07-02",
      id: "same-day",
      summary: "Same day",
    };

    expect(
      allDayContextOverlapsProposal(
        context,
        "2026-07-01T16:00:00.000Z",
        "2026-07-01T17:00:00.000Z",
        "America/New_York",
      ),
    ).toBe(true);
    expect(
      allDayContextOverlapsProposal(
        context,
        "2026-07-02T16:00:00.000Z",
        "2026-07-02T17:00:00.000Z",
        "America/New_York",
      ),
    ).toBe(false);
  });

  it("detects a date-only all-day event spanning D through D+2 on an interior date", () => {
    expect(
      allDayContextOverlapsProposal(
        {
          date: "2026-07-01",
          endDate: "2026-07-04",
          id: "multi-day",
          summary: "Multi day",
        },
        "2026-07-02T14:00:00.000Z",
        "2026-07-02T15:00:00.000Z",
        "America/New_York",
      ),
    ).toBe(true);
  });

  it("handles DST-transition all-day context overlap by the user's Toronto calendar date", () => {
    const context = {
      date: "2026-03-08",
      endDate: "2026-03-09",
      id: "dst-day",
      summary: "DST day",
    };

    expect(
      getCalendarDateKey("2026-03-08T06:30:00.000Z", "America/Toronto"),
    ).toBe("2026-03-08");
    expect(
      allDayContextOverlapsProposal(
        context,
        "2026-03-08T06:30:00.000Z",
        "2026-03-08T07:30:00.000Z",
        "America/Toronto",
      ),
    ).toBe(true);
    expect(
      allDayContextOverlapsProposal(
        context,
        "2026-03-09T04:30:00.000Z",
        "2026-03-09T05:30:00.000Z",
        "America/Toronto",
      ),
    ).toBe(false);
  });

  it("uses the Pacific/Auckland local date for all-day context overlap instead of the UTC date", () => {
    const payload = {
      items: [
        {
          id: "utc-date",
          summary: "UTC date",
          start: { date: "2026-07-01" },
          end: { date: "2026-07-02" },
        },
        {
          id: "local-date",
          summary: "Local date",
          start: { date: "2026-07-02" },
          end: { date: "2026-07-03" },
        },
      ],
    };

    expect(
      getCalendarDateKey("2026-07-01T12:30:00.000Z", "Pacific/Auckland"),
    ).toBe("2026-07-02");
    expect(
      extractAllDayContexts(
        payload,
        "2026-07-01T12:30:00.000Z",
        "2026-07-01T13:30:00.000Z",
        "Pacific/Auckland",
      ),
    ).toEqual([
      {
        date: "2026-07-02",
        endDate: "2026-07-03",
        id: "local-date",
        summary: "Local date",
      },
    ]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mocks.buildGoogleAccessTokenExpiresAt.mockReturnValue(
      "2026-05-09T02:00:00.000Z",
    );
  });

  it("refreshes expired access tokens before querying free/busy and persists the new token", async () => {
    mocks.decryptGoogleCalendarToken.mockReturnValue("google-refresh-token");
    mocks.refreshGoogleCalendarAccessToken.mockResolvedValue({
      accessToken: "refreshed-access-token",
      expiresIn: 3600,
      refreshToken: null,
      scope: null,
      tokenType: "Bearer",
    });
    mocks.encryptGoogleCalendarToken.mockReturnValue(
      "encrypted-refreshed-access",
    );
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await checkGoogleCalendarFreeBusyForConnection({
      connection,
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
    });

    expect(result.hasConflict).toBe(false);
    expect(mocks.refreshGoogleCalendarAccessToken).toHaveBeenCalledWith({
      refreshToken: "google-refresh-token",
    });
    expect(
      mocks.upsertGoogleCalendarConnectionForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      expect.objectContaining({
        encrypted_access_token: "encrypted-refreshed-access",
        encrypted_refresh_token: "encrypted-google-refresh-token",
        token_expires_at: "2026-05-09T02:00:00.000Z",
      }),
    );
  });

  it("reports a conflict when the free/busy response contains busy windows", async () => {
    mocks.decryptGoogleCalendarToken.mockReturnValue("google-access-token");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-05-10T16:15:00.000Z",
                  end: "2026-05-10T16:45:00.000Z",
                },
              ],
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await checkGoogleCalendarFreeBusyForConnection({
      connection: {
        ...connection,
        token_expires_at: "2099-05-09T02:00:00.000Z",
      },
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
    });

    expect(result.hasConflict).toBe(true);
    expect(mocks.refreshGoogleCalendarAccessToken).not.toHaveBeenCalled();
  });

  it("reports a conflict when an opaque all-day event is reported busy by free/busy", async () => {
    mocks.decryptGoogleCalendarToken.mockReturnValue("google-access-token");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-07-01T04:00:00.000Z",
                  end: "2026-07-02T04:00:00.000Z",
                },
              ],
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "dentist-day",
              summary: "Dentist day",
              start: { date: "2026-07-01" },
              end: { date: "2026-07-02" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await checkGoogleCalendarFreeBusyForConnection({
      connection: {
        ...connection,
        token_expires_at: "2099-05-09T02:00:00.000Z",
      },
      proposedEnd: "2026-07-01T17:00:00.000Z",
      proposedStart: "2026-07-01T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/New_York",
    });

    expect(result.hasConflict).toBe(true);
    expect(result.allDayContexts).toEqual([
      {
        date: "2026-07-01",
        endDate: "2026-07-02",
        id: "dentist-day",
        summary: "Dentist day",
      },
    ]);
  });

  it("keeps all-day contexts informational so they never contribute to hasConflict", async () => {
    mocks.decryptGoogleCalendarToken.mockReturnValue("google-access-token");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "birthday",
              summary: "Mom's birthday",
              start: { date: "2026-07-01" },
              end: { date: "2026-07-02" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await checkGoogleCalendarFreeBusyForConnection({
      connection: {
        ...connection,
        token_expires_at: "2099-05-09T02:00:00.000Z",
      },
      proposedEnd: "2026-07-01T17:00:00.000Z",
      proposedStart: "2026-07-01T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/New_York",
    });

    expect(result.hasConflict).toBe(false);
    expect(result.allDayContexts).toEqual([
      {
        date: "2026-07-01",
        endDate: "2026-07-02",
        id: "birthday",
        summary: "Mom's birthday",
      },
    ]);
  });

  it("ignores an opaque all-day event on an adjacent local day despite a timezone offset", async () => {
    mocks.decryptGoogleCalendarToken.mockReturnValue("google-access-token");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          calendars: {
            primary: {
              busy: [
                {
                  start: "2026-07-02T04:00:00.000Z",
                  end: "2026-07-03T04:00:00.000Z",
                },
              ],
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "next-day-block",
              summary: "Offsite day",
              start: { date: "2026-07-02" },
              end: { date: "2026-07-03" },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await checkGoogleCalendarFreeBusyForConnection({
      connection: {
        ...connection,
        token_expires_at: "2099-05-09T02:00:00.000Z",
      },
      proposedEnd: "2026-07-02T01:00:00.000Z",
      proposedStart: "2026-07-02T00:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/New_York",
    });

    expect(result.hasConflict).toBe(false);
    expect(result.allDayContexts).toEqual([]);
  });

  it.each([
    {
      name: "multi-day span in a timezone east of UTC",
      timezone: "Asia/Tokyo",
      proposedStart: "2026-07-01T00:30:00.000Z",
      proposedEnd: "2026-07-01T01:30:00.000Z",
      allDayStart: "2026-07-01",
      allDayEnd: "2026-07-03",
    },
    {
      name: "single DST boundary day in a timezone west of UTC",
      timezone: "America/New_York",
      proposedStart: "2026-03-08T14:00:00.000Z",
      proposedEnd: "2026-03-08T15:00:00.000Z",
      allDayStart: "2026-03-08",
      allDayEnd: "2026-03-09",
    },
  ])(
    "maps all-day context by the user's calendar date: $name",
    async ({
      allDayEnd,
      allDayStart,
      proposedEnd,
      proposedStart,
      timezone,
    }) => {
      mocks.decryptGoogleCalendarToken.mockReturnValue("google-access-token");
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ calendars: { primary: { busy: [] } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "all-day-context",
                summary: "Focus label",
                start: { date: allDayStart },
                end: { date: allDayEnd },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const result = await checkGoogleCalendarFreeBusyForConnection({
        connection: {
          ...connection,
          token_expires_at: "2099-05-09T02:00:00.000Z",
        },
        proposedEnd,
        proposedStart,
        supabaseAccessToken: "supabase-access-token",
        timezone,
      });

      expect(result.hasConflict).toBe(false);
      expect(result.allDayContexts).toEqual([
        {
          date: allDayStart,
          endDate: allDayEnd,
          id: "all-day-context",
          summary: "Focus label",
        },
      ]);
    },
  );
});
