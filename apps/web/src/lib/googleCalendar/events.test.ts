import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveGoogleCalendarAccessToken: vi.fn(),
}));

vi.mock("./freebusy", () => ({
  resolveGoogleCalendarAccessToken: mocks.resolveGoogleCalendarAccessToken,
}));

import { insertGoogleCalendarEventForConnection } from "./events";

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
    mocks.resolveGoogleCalendarAccessToken.mockResolvedValue("google-access-token");
  });

  it("maps a local proposal to a minimal Google Calendar event insert body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "google-event-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await insertGoogleCalendarEventForConnection({
      connection,
      description: "Created by LifeOS.",
      proposalId: "550e8400-e29b-41d4-a716-446655440501",
      proposedEnd: "2026-05-10T17:00:00.000Z",
      proposedStart: "2026-05-10T16:00:00.000Z",
      supabaseAccessToken: "supabase-access-token",
      timezone: "America/Toronto",
      title: "Call dentist tomorrow",
    });

    expect(result.googleEventId).toBe("google-event-1");
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
          lifeos_proposal_id: "550e8400-e29b-41d4-a716-446655440501",
        },
      },
    });
    expect(body.attendees).toBeUndefined();
    expect(body.conferenceData).toBeUndefined();
    expect(body.recurrence).toBeUndefined();
  });
});
