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

import { checkGoogleCalendarFreeBusyForConnection } from "./freebusy";

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

  it("surfaces all-day event context without treating the day as busy", async () => {
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

    expect(result.hasConflict).toBe(false);
    expect(result.allDayContexts).toEqual([
      {
        date: "2026-07-01",
        endDate: "2026-07-02",
        id: "dentist-day",
        summary: "Dentist day",
      },
    ]);
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
