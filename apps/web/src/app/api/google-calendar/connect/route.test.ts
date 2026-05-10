import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildGoogleCalendarAuthorizeUrl: vi.fn(),
  createGoogleCalendarOAuthState: vi.fn(),
  getGoogleCalendarConfig: vi.fn(),
  getGoogleCalendarOAuthStateCookieOptions: vi.fn(),
  requireSupabaseServerUser: vi.fn(),
  sealGoogleCalendarOAuthStateCookie: vi.fn(),
}));

vi.mock("@/lib/googleCalendar/config", () => ({
  getGoogleCalendarConfig: mocks.getGoogleCalendarConfig,
}));

vi.mock("@/lib/googleCalendar/oauth", () => ({
  buildGoogleCalendarAuthorizeUrl: mocks.buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarOAuthState: mocks.createGoogleCalendarOAuthState,
  getGoogleCalendarOAuthStateCookieOptions:
    mocks.getGoogleCalendarOAuthStateCookieOptions,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE: "lifeos_google_calendar_oauth",
  sealGoogleCalendarOAuthStateCookie: mocks.sealGoogleCalendarOAuthStateCookie,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
}));

import { POST } from "./route";

describe("google-calendar connect route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGoogleCalendarOAuthStateCookieOptions.mockReturnValue({
      httpOnly: true,
      maxAge: 600,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
  });

  it("returns a clear config error when Google env vars are absent", async () => {
    mocks.getGoogleCalendarConfig.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost/api/google-calendar/connect", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns an authorize URL and sets a short-lived OAuth state cookie", async () => {
    mocks.getGoogleCalendarConfig.mockReturnValue({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: "token-encryption-key",
    });
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: "550e8400-e29b-41d4-a716-446655440001" },
    });
    mocks.createGoogleCalendarOAuthState.mockReturnValue("state-123");
    mocks.buildGoogleCalendarAuthorizeUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth?state=state-123",
    );
    mocks.sealGoogleCalendarOAuthStateCookie.mockReturnValue("sealed-cookie");

    const response = await POST(
      new Request("http://localhost/api/google-calendar/connect", {
        method: "POST",
        headers: {
          Authorization: "Bearer supabase-access-token",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      authorizeUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?state=state-123",
    });
    expect(mocks.requireSupabaseServerUser).toHaveBeenCalledWith(
      "supabase-access-token",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "lifeos_google_calendar_oauth=sealed-cookie",
    );
  });
});
