import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  upsertGoogleCalendarConnectionForAccessToken: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  getGoogleCalendarStoredConnectionForAccessToken:
    mocks.getGoogleCalendarStoredConnectionForAccessToken,
  upsertGoogleCalendarConnectionForAccessToken:
    mocks.upsertGoogleCalendarConnectionForAccessToken,
}));

import { POST } from "./route";

describe("google-calendar disconnect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated disconnect requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/google-calendar/disconnect", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
  });

  it("updates local connection metadata to disconnected", async () => {
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: "550e8400-e29b-41d4-a716-446655440001" },
    });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: {
        id: "550e8400-e29b-41d4-a716-446655440401",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        provider: "google_calendar",
        calendar_id: "primary",
        encrypted_access_token: "encrypted-google-access-token",
        encrypted_refresh_token: "encrypted-google-refresh-token",
        granted_scopes_json: [
          "https://www.googleapis.com/auth/calendar.freebusy",
          "https://www.googleapis.com/auth/calendar.events.owned",
        ],
        status: "connected",
        first_write_warning_acknowledged_at: null,
        connected_at: "2026-05-09T00:00:00.000Z",
        disconnected_at: null,
        token_expires_at: "2026-05-09T01:00:00.000Z",
        token_type: "Bearer",
        created_at: "2026-05-09T00:00:00.000Z",
        updated_at: "2026-05-09T00:00:00.000Z",
      },
    });
    mocks.upsertGoogleCalendarConnectionForAccessToken.mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440401",
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      provider: "google_calendar",
      calendar_id: "primary",
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      granted_scopes_json: [
        "https://www.googleapis.com/auth/calendar.freebusy",
        "https://www.googleapis.com/auth/calendar.events.owned",
      ],
      status: "disconnected",
      first_write_warning_acknowledged_at: null,
      connected_at: "2026-05-09T00:00:00.000Z",
      disconnected_at: "2026-05-09T01:00:00.000Z",
      token_expires_at: null,
      token_type: null,
      created_at: "2026-05-09T00:00:00.000Z",
      updated_at: "2026-05-09T01:00:00.000Z",
    });

    const response = await POST(
      new Request("http://localhost/api/google-calendar/disconnect", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(
      mocks.upsertGoogleCalendarConnectionForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      expect.objectContaining({
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        status: "disconnected",
        token_expires_at: null,
        token_type: null,
        user_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    );
  });
});
