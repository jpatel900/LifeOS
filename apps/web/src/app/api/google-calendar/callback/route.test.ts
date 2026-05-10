import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildGoogleAccessTokenExpiresAt: vi.fn(),
  encryptGoogleCalendarToken: vi.fn(),
  exchangeGoogleCalendarCode: vi.fn(),
  getGoogleCalendarStoredConnectionForAccessToken: vi.fn(),
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

vi.mock("@/lib/googleCalendar/tokens", () => ({
  buildGoogleAccessTokenExpiresAt: mocks.buildGoogleAccessTokenExpiresAt,
  encryptGoogleCalendarToken: mocks.encryptGoogleCalendarToken,
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

import { GET } from "./route";

describe("google-calendar callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: "token-encryption-key",
    });
    mocks.getGoogleCalendarOAuthStateCookieOptions.mockReturnValue({
      httpOnly: true,
      maxAge: 600,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: null,
    });
    mocks.buildGoogleAccessTokenExpiresAt.mockReturnValue(
      "2026-05-09T01:00:00.000Z",
    );
    mocks.encryptGoogleCalendarToken
      .mockReturnValueOnce("encrypted-google-access-token")
      .mockReturnValueOnce("encrypted-google-refresh-token");
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

  it("upserts encrypted token state after a valid OAuth callback", async () => {
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
      refreshToken: "google-refresh-token",
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
        encrypted_access_token: "encrypted-google-access-token",
        encrypted_refresh_token: "encrypted-google-refresh-token",
        granted_scopes_json: [
          "https://www.googleapis.com/auth/calendar.events.owned",
          "https://www.googleapis.com/auth/calendar.freebusy",
        ],
        status: "connected",
        token_expires_at: "2026-05-09T01:00:00.000Z",
        token_type: "Bearer",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    );
  });

  it("fails safely when Google does not return a refresh token and none is stored", async () => {
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
    mocks.getGoogleCalendarStoredConnectionForAccessToken.mockResolvedValue({
      connection: null,
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
      "googleCalendarError=refresh_token_missing",
    );
    expect(
      mocks.upsertGoogleCalendarConnectionForAccessToken,
    ).not.toHaveBeenCalledWith(
      "supabase-access-token",
      expect.objectContaining({
        status: "connected",
      }),
    );
  });
});
