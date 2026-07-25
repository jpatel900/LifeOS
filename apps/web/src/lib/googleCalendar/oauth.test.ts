import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarOAuthState,
  exchangeGoogleCalendarCode,
  GoogleOAuthProviderError,
  isGoogleCalendarOAuthStateValid,
  isGoogleOAuthProviderError,
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

  // #743 P0 follow-up: `isGoogleOAuthProviderError` replaces `instanceof`
  // checks at the call sites (callback route, freebusy refresh) because
  // `instanceof` can silently fail across a bundle/chunk split.
  describe("isGoogleOAuthProviderError (#743 P0)", () => {
    it("recognizes a real GoogleOAuthProviderError instance", () => {
      const error = new GoogleOAuthProviderError({
        phase: "exchange",
        code: "invalid_grant",
        description: null,
        httpStatus: 400,
      });

      expect(isGoogleOAuthProviderError(error)).toBe(true);
    });

    it("recognizes a duck-typed error carrying the same name and shape, simulating a cross-bundle class identity split", () => {
      class DuplicateGoogleOAuthProviderError extends Error {
        code = "invalid_grant";
        description: string | null = null;
        httpStatus = 400;
        phase = "exchange" as const;
        constructor() {
          super("Google Calendar connection step did not complete.");
          this.name = "GoogleOAuthProviderError";
        }
      }
      const crossBundleError = new DuplicateGoogleOAuthProviderError();

      // The whole point: this would NOT be `instanceof GoogleOAuthProviderError`
      // (different class from a different module instance), but it still
      // carries the marker name and shape, so the guard must still say yes.
      expect(crossBundleError instanceof GoogleOAuthProviderError).toBe(false);
      expect(isGoogleOAuthProviderError(crossBundleError)).toBe(true);
    });

    it("rejects ordinary errors, including ones with an unrelated custom name", () => {
      expect(isGoogleOAuthProviderError(new Error("plain failure"))).toBe(
        false,
      );

      const namedError = new Error("schema validation failed");
      namedError.name = "ZodError";
      expect(isGoogleOAuthProviderError(namedError)).toBe(false);

      expect(isGoogleOAuthProviderError("not an error")).toBe(false);
      expect(isGoogleOAuthProviderError(null)).toBe(false);
    });
  });
});
