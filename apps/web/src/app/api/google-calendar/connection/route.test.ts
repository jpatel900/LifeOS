import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarConnectionForAccessToken: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  getGoogleCalendarConnectionForAccessToken:
    mocks.getGoogleCalendarConnectionForAccessToken,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

import { GET } from "./route";

const connection = {
  id: "550e8400-e29b-41d4-a716-446655440901",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  provider: "google_calendar" as const,
  calendar_id: "primary",
  granted_scopes_json: [],
  status: "connected" as const,
  first_write_warning_acknowledged_at: null,
  connected_at: "2026-05-09T00:00:00.000Z",
  disconnected_at: null,
  created_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
};

function request(token?: string) {
  return new Request("http://localhost/api/google-calendar/connection", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

describe("google-calendar connection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: "token-encryption-key",
    });
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: "550e8400-e29b-41d4-a716-446655440001" },
    });
    mocks.getGoogleCalendarConnectionForAccessToken.mockResolvedValue({
      connection,
    });
  });

  it("returns a disconnected configured:false payload when Google config is absent", async () => {
    mocks.getGoogleCalendarConfig.mockReturnValue(null);

    const response = await GET(request("supabase-access-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(false);
    expect(body.status).toBe("disconnected");
  });

  it("requires auth when no bearer token is provided", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe(
      "Sign in before loading Google Calendar connection status.",
    );
  });

  it("does not expose raw auth errors", async () => {
    mocks.requireSupabaseServerUser.mockRejectedValue(
      new Error("JWT expired: internal stack trace"),
    );

    const response = await GET(request("supabase-access-token"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe(
      "Sign in before loading Google Calendar connection status.",
    );
    expect(body.error).not.toContain("stack trace");
  });

  it("surfaces the stored, sanitized error reason in plain language (#743)", async () => {
    mocks.getGoogleCalendarConnectionForAccessToken.mockResolvedValue({
      connection: {
        ...connection,
        status: "error",
        last_error_json: {
          code: "invalid_grant",
          description: "Malformed auth code.",
          http_status: 400,
          at: "2026-07-25T00:00:00.000Z",
        },
      },
    });

    const response = await GET(request("supabase-access-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("error");
    expect(body.message).toBe(
      "The sign-in code expired or was already used. Try connecting again.",
    );
    expect(body.reason).toEqual({
      code: "invalid_grant",
      description: "Malformed auth code.",
      glance:
        "The sign-in code expired or was already used. Try connecting again.",
    });
  });

  it("surfaces a stored reason even while status is still connected (#743)", async () => {
    // A refresh attempt can fail and get recorded without flipping the
    // connection's status (see resolveGoogleCalendarAccessToken in
    // freebusy.ts) -- the reason must still reach the owner, not only when
    // status has been flipped to "error" by a full callback failure.
    mocks.getGoogleCalendarConnectionForAccessToken.mockResolvedValue({
      connection: {
        ...connection,
        status: "connected",
        last_error_json: {
          code: "invalid_grant",
          description: "Token has been expired or revoked.",
          http_status: 400,
          at: "2026-07-25T00:00:00.000Z",
        },
      },
    });

    const response = await GET(request("supabase-access-token"));
    const body = await response.json();

    expect(body.status).toBe("connected");
    expect(body.message).toBe(
      "Google Calendar is connected. LifeOS only checks your availability or adds events when you explicitly ask — never on its own.",
    );
    expect(body.reason).toEqual({
      code: "invalid_grant",
      description: "Token has been expired or revoked.",
      glance:
        "The sign-in code expired or was already used. Try connecting again.",
    });
  });

  it("falls back to the generic error message when no reason was ever stored", async () => {
    mocks.getGoogleCalendarConnectionForAccessToken.mockResolvedValue({
      connection: { ...connection, status: "error", last_error_json: null },
    });

    const response = await GET(request("supabase-access-token"));
    const body = await response.json();

    expect(body.status).toBe("error");
    expect(body.reason).toBeNull();
    expect(body.message).toBe(
      "The last attempt to connect Google Calendar failed safely. Please connect again to retry.",
    );
  });

  it("returns a safe failure message when connection lookup fails unexpectedly", async () => {
    mocks.getGoogleCalendarConnectionForAccessToken.mockRejectedValue(
      new Error("database timeout while loading connection"),
    );

    const response = await GET(request("supabase-access-token"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe(
      "Google Calendar connection status could not load. Local planning is still available.",
    );
    expect(body.error).not.toContain("database timeout");
  });
});
