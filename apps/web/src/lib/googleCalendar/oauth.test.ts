import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarOAuthState,
  exchangeGoogleCalendarCode,
  GoogleOAuthProviderError,
  isGoogleCalendarOAuthStateValid,
  readGoogleCalendarOAuthStateCookie,
  refreshGoogleCalendarAccessToken,
  sealGoogleCalendarOAuthStateCookie,
} from "./oauth";

describe("Google Calendar OAuth helpers", () => {
  beforeEach(() => {
    vi.useRealTimers();
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/api/google-calendar/callback";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "token-encryption-key";
  });

  it("requests offline access for Google Calendar OAuth", () => {
    const url = new URL(buildGoogleCalendarAuthorizeUrl("state-123"));

    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("round-trips a sealed OAuth state cookie payload", () => {
    const state = createGoogleCalendarOAuthState();
    const cookieValue = sealGoogleCalendarOAuthStateCookie({
      accessToken: "supabase-access-token",
      state,
      userId: "550e8400-e29b-41d4-a716-446655440001",
    });

    const payload = readGoogleCalendarOAuthStateCookie(cookieValue);

    expect(payload).toMatchObject({
      accessToken: "supabase-access-token",
      state,
      userId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(isGoogleCalendarOAuthStateValid(payload, state)).toBe(true);
  });

  it("rejects mismatched state values", () => {
    const cookieValue = sealGoogleCalendarOAuthStateCookie({
      accessToken: "supabase-access-token",
      state: "expected-state",
      userId: "550e8400-e29b-41d4-a716-446655440001",
    });

    const payload = readGoogleCalendarOAuthStateCookie(cookieValue);

    expect(isGoogleCalendarOAuthStateValid(payload, "wrong-state")).toBe(false);
  });

  it("rejects expired OAuth state payloads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00.000Z"));

    const cookieValue = sealGoogleCalendarOAuthStateCookie({
      accessToken: "supabase-access-token",
      state: "state-value",
      userId: "550e8400-e29b-41d4-a716-446655440001",
    });
    vi.setSystemTime(new Date("2026-05-09T00:11:00.000Z"));
    const payload = readGoogleCalendarOAuthStateCookie(cookieValue);

    expect(isGoogleCalendarOAuthStateValid(payload, "state-value")).toBe(false);
  });

  describe("provider error capture (#743)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("captures Google's code/description/status instead of discarding them on exchange failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "Malformed auth code.",
            }),
            { status: 400 },
          ),
        ),
      );

      await expect(
        exchangeGoogleCalendarCode({ code: "auth-code-value" }),
      ).rejects.toMatchObject({
        name: "GoogleOAuthProviderError",
        code: "invalid_grant",
        description: "Malformed auth code.",
        httpStatus: 400,
        phase: "exchange",
      });
    });

    it("falls back to unknown_error when Google's exchange failure body has no error field", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("not json", { status: 500 })),
      );

      await expect(
        exchangeGoogleCalendarCode({ code: "auth-code-value" }),
      ).rejects.toMatchObject({
        code: "unknown_error",
        description: null,
        httpStatus: 500,
      });
    });

    it("never leaks the client secret or authorization code into the thrown error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: "invalid_client",
              error_description: "Unauthorized client.",
            }),
            { status: 401 },
          ),
        ),
      );

      let caught: unknown;
      try {
        await exchangeGoogleCalendarCode({ code: "super-secret-auth-code" });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(GoogleOAuthProviderError);
      const serialized = JSON.stringify(
        caught,
        Object.getOwnPropertyNames(caught),
      );
      expect(serialized).not.toContain("super-secret-auth-code");
      expect(serialized).not.toContain("client-secret");
    });

    it("captures Google's code/description/status instead of discarding them on refresh failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "Token has been expired or revoked.",
            }),
            { status: 400 },
          ),
        ),
      );

      await expect(
        refreshGoogleCalendarAccessToken({
          refreshToken: "refresh-token-value",
        }),
      ).rejects.toMatchObject({
        name: "GoogleOAuthProviderError",
        code: "invalid_grant",
        description: "Token has been expired or revoked.",
        httpStatus: 400,
        phase: "refresh",
      });
    });
  });
});
