import { beforeEach, describe, expect, it } from "vitest";
import {
  buildGoogleAccessTokenExpiresAt,
  decryptGoogleCalendarToken,
  encryptGoogleCalendarToken,
} from "./tokens";

describe("Google Calendar token helpers", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/api/google-calendar/callback";
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "token-encryption-key";
  });

  it("round-trips encrypted Google tokens server-side", () => {
    const sealed = encryptGoogleCalendarToken("google-refresh-token");

    expect(sealed).not.toContain("google-refresh-token");
    expect(decryptGoogleCalendarToken(sealed)).toBe("google-refresh-token");
  });

  it("rejects encryption when the token key is unavailable", () => {
    delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptGoogleCalendarToken("google-access-token")).toThrow(
      /not configured/i,
    );
  });

  it("calculates token expiry timestamps from expires_in seconds", () => {
    expect(
      buildGoogleAccessTokenExpiresAt(3600, "2026-05-09T00:00:00.000Z"),
    ).toBe("2026-05-09T01:00:00.000Z");
  });
});
