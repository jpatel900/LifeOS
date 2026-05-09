import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeGoogleCalendarCode: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarOAuthStateCookieOptions: vi.fn(),
  isGoogleCalendarOAuthStateValid: vi.fn(),
  readGoogleCalendarOAuthStateCookie: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  upsertGoogleCalendarConnectionForAccessToken: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/oauth", () => ({
  exchangeGoogleCalendarCode: mocks.exchangeGoogleCalendarCode,
  getGoogleCalendarOAuthStateCookieOptions:
    mocks.getGoogleCalendarOAuthStateCookieOptions,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE: "lifeos_google_calendar_oauth",
  isGoogleCalendarOAuthStateValid: mocks.isGoogleCalendarOAuthStateValid,
  readGoogleCalendarOAuthStateCookie: mocks.readGoogleCalendarOAuthStateCookie,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

vi.mock("@/lib/googleCalendar/server", () => ({
  upsertGoogleCalendarConnectionForAccessToken:
    mocks.upsertGoogleCalendarConnectionForAccessToken,
}));

import { GET } from "./route";

describe("google-calendar callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: null,
    });
    mocks.getGoogleCalendarOAuthStateCookieOptions.mockReturnValue({
      httpOnly: true,
      maxAge: 600,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("rejects invalid callback state", async () => {
    mocks.readGoogleCalendarOAuthStateCookie.mockReturnValue({
      state: "expected-state",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      accessToken: "supabase-access-token",
      createdAt: "2026-05-09T00:00:00.000Z",
    });
    mocks.isGoogleCalendarOAuthStateValid.mockReturnValue(false);

    const response = await GET(
      new Request(
        "http://localhost/api/google-calendar/callback?state=wrong-state&code=abc",
        {
          headers: {
            Cookie: "lifeos_google_calendar_oauth=sealed-cookie",
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "googleCalendarError=invalid_state",
    );
  });

  it("requires an authenticated user for the callback flow", async () => {
    mocks.readGoogleCalendarOAuthStateCookie.mockReturnValue({
      state: "expected-state",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      accessToken: "supabase-access-token",
      createdAt: "2026-05-09T00:00:00.000Z",
    });
    mocks.isGoogleCalendarOAuthStateValid.mockReturnValue(true);
    mocks.requireSupabaseServerUser.mockRejectedValue(
      new Error("Sign in before using this server action."),
    );

    const response = await GET(
      new Request(
        "http://localhost/api/google-calendar/callback?state=expected-state&code=abc",
        {
          headers: {
            Cookie: "lifeos_google_calendar_oauth=sealed-cookie",
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "googleCalendarError=auth_required",
    );
  });

  it("upserts connection metadata after a valid OAuth callback", async () => {
    mocks.readGoogleCalendarOAuthStateCookie.mockReturnValue({
      state: "expected-state",
      userId: "550e8400-e29b-41d4-a716-446655440001",
      accessToken: "supabase-access-token",
      createdAt: "2026-05-09T00:00:00.000Z",
    });
    mocks.isGoogleCalendarOAuthStateValid.mockReturnValue(true);
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: "550e8400-e29b-41d4-a716-446655440001" },
    });
    mocks.exchangeGoogleCalendarCode.mockResolvedValue({
      accessToken: "google-access-token",
      expiresIn: 3600,
      refreshToken: null,
      scope: [
        "https://www.googleapis.com/auth/calendar.events.owned",
        "https://www.googleapis.com/auth/calendar.freebusy",
      ],
      tokenType: "Bearer",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/google-calendar/callback?state=expected-state&code=abc",
        {
          headers: {
            Cookie: "lifeos_google_calendar_oauth=sealed-cookie",
          },
        },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain(
      "googleCalendar=connected",
    );
    expect(
      mocks.upsertGoogleCalendarConnectionForAccessToken,
    ).toHaveBeenCalledWith(
      "supabase-access-token",
      expect.objectContaining({
        calendar_id: "primary",
        granted_scopes_json: [
          "https://www.googleapis.com/auth/calendar.events.owned",
          "https://www.googleapis.com/auth/calendar.freebusy",
        ],
        status: "connected",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    );
  });
});
