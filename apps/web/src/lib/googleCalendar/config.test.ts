import { describe, expect, it } from "vitest";
import { getGoogleCalendarConfig, isGoogleCalendarConfigured } from "./config";

describe("Google Calendar server config", () => {
  it("stays disabled when optional Google env vars are absent", () => {
    const env = {};

    expect(getGoogleCalendarConfig(env)).toBeNull();
    expect(isGoogleCalendarConfigured(env)).toBe(false);
  });

  it("requires the full OAuth env set before reporting configured", () => {
    const env = {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    };

    expect(getGoogleCalendarConfig(env)).toBeNull();
    expect(isGoogleCalendarConfigured(env)).toBe(false);
  });

  it("returns server-only Google Calendar config without requiring token encryption yet", () => {
    const env = {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REDIRECT_URI: "http://localhost:3000/api/google-calendar/callback",
    };

    expect(getGoogleCalendarConfig(env)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google-calendar/callback",
      tokenEncryptionKey: null,
    });
    expect(isGoogleCalendarConfigured(env)).toBe(true);
  });
});
