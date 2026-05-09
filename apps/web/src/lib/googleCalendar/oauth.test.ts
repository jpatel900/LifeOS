import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGoogleCalendarOAuthState,
  isGoogleCalendarOAuthStateValid,
  readGoogleCalendarOAuthStateCookie,
  sealGoogleCalendarOAuthStateCookie,
} from "./oauth";

describe("Google Calendar OAuth helpers", () => {
  beforeEach(() => {
    vi.useRealTimers();
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3000/api/google-calendar/callback";
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
});
