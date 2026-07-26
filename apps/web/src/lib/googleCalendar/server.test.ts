import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSupabaseServerUser: vi.fn(),
  requireSupabaseServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  requireSupabaseServerUser: mocks.requireSupabaseServerUser,
  requireSupabaseServiceRoleClient: mocks.requireSupabaseServiceRoleClient,
}));

import {
  getGoogleCalendarConnectionForAccessToken,
  getGoogleCalendarStoredConnectionForAccessToken,
  upsertGoogleCalendarConnectionForAccessToken,
} from "./server";

const user = { id: "550e8400-e29b-41d4-a716-446655440001" };
const storedConnection = {
  id: "550e8400-e29b-41d4-a716-446655440901",
  user_id: user.id,
  provider: "google_calendar",
  calendar_id: "primary",
  encrypted_access_token: "encrypted-access",
  encrypted_refresh_token: "encrypted-refresh",
  granted_scopes_json: [],
  status: "connected",
  first_write_warning_acknowledged_at: null,
  connected_at: "2026-05-09T00:00:00.000Z",
  disconnected_at: null,
  last_error_json: null,
  token_expires_at: "2026-05-09T01:00:00.000Z",
  token_type: "Bearer",
  created_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
};

describe("Google Calendar server persistence helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSupabaseServerUser.mockResolvedValue({ user });
  });

  it("reads encrypted token state only through the service-role client after user validation", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: storedConnection,
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const serviceClient = {
      from: vi.fn().mockReturnValue({ select }),
    };
    mocks.requireSupabaseServiceRoleClient.mockReturnValue(serviceClient);

    const result = await getGoogleCalendarStoredConnectionForAccessToken(
      "supabase-access-token",
    );

    expect(result.connection?.encrypted_refresh_token).toBe(
      "encrypted-refresh",
    );
    expect(mocks.requireSupabaseServerUser).toHaveBeenCalledWith(
      "supabase-access-token",
    );
    expect(mocks.requireSupabaseServiceRoleClient).toHaveBeenCalled();
    expect(serviceClient.from).toHaveBeenCalledWith(
      "google_calendar_connections",
    );
    expect(eq).toHaveBeenCalledWith("user_id", user.id);
  });

  it("rejects service-role connection upserts for a different authenticated user", async () => {
    await expect(
      upsertGoogleCalendarConnectionForAccessToken("supabase-access-token", {
        calendar_id: "primary",
        connected_at: null,
        disconnected_at: null,
        granted_scopes_json: [],
        status: "metadata_only",
        user_id: "550e8400-e29b-41d4-a716-446655440099",
      }),
    ).rejects.toThrow(/user mismatch/i);

    expect(mocks.requireSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("writes last_error_json only when the caller supplies the key (#743)", async () => {
    const single = vi.fn().mockResolvedValue({
      data: storedConnection,
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const serviceClient = { from: vi.fn().mockReturnValue({ upsert }) };
    mocks.requireSupabaseServiceRoleClient.mockReturnValue(serviceClient);

    await upsertGoogleCalendarConnectionForAccessToken(
      "supabase-access-token",
      {
        calendar_id: "primary",
        connected_at: null,
        disconnected_at: "2026-07-25T00:00:00.000Z",
        granted_scopes_json: [],
        last_error_json: {
          code: "invalid_grant",
          description: "Malformed auth code.",
          http_status: 400,
          at: "2026-07-25T00:00:00.000Z",
        },
        status: "error",
        user_id: user.id,
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        last_error_json: {
          code: "invalid_grant",
          description: "Malformed auth code.",
          http_status: 400,
          at: "2026-07-25T00:00:00.000Z",
        },
      }),
      { onConflict: "user_id" },
    );

    upsert.mockClear();

    await upsertGoogleCalendarConnectionForAccessToken(
      "supabase-access-token",
      {
        calendar_id: "primary",
        connected_at: "2026-07-25T00:00:00.000Z",
        disconnected_at: null,
        granted_scopes_json: [],
        status: "connected",
        user_id: user.id,
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ last_error_json: expect.anything() }),
      { onConflict: "user_id" },
    );
  });

  // #743 P0 incident: this is the verbatim production row (tokens redacted)
  // that failed to parse in production. PostgREST serializes `timestamptz`
  // columns with a numeric offset ("+00:00"), not a "Z" suffix -- Zod's plain
  // `.datetime()` only accepts "Z". Every read of this table 503'd, and the
  // OAuth callback died on this same read ~53ms before the token exchange
  // ever ran. Fixture must stay verbatim; CI missed this because every other
  // fixture in this suite (including `storedConnection` above) uses
  // "Z"-suffixed datetimes, which is exactly what let the bug ship.
  it("parses a real PostgREST row with offset-format timestamps instead of 503ing (#743 P0)", async () => {
    const productionRow = {
      id: "c6b5d8ac-630b-41c9-ac30-5448887513d7",
      status: "error",
      user_id: "bf369e8a-8b2b-4d73-b611-8f62999d510f",
      provider: "google_calendar",
      created_at: "2026-05-28T18:09:22.314246+00:00",
      token_type: "Bearer",
      updated_at: "2026-07-25T22:08:43.942452+00:00",
      calendar_id: "primary",
      connected_at: null,
      disconnected_at: "2026-07-25T22:08:43.897+00:00",
      last_error_json: {
        at: "2026-07-25T22:08:43.897Z",
        code: "callback_failed",
        description: null,
        http_status: null,
      },
      token_expires_at: "2026-05-28T19:09:21.239+00:00",
      granted_scopes_json: [],
      first_write_warning_acknowledged_at: null,
    };

    const maybeSingleUser = vi.fn().mockResolvedValue({
      data: productionRow,
      error: null,
    });
    const selectUser = vi
      .fn()
      .mockReturnValue({ maybeSingle: maybeSingleUser });
    const userClient = {
      from: vi.fn().mockReturnValue({ select: selectUser }),
    };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: userClient,
      user: { id: "bf369e8a-8b2b-4d73-b611-8f62999d510f" },
    });

    const userResult = await getGoogleCalendarConnectionForAccessToken(
      "supabase-access-token",
    );

    expect(userResult.connection?.status).toBe("error");
    expect(userResult.connection?.disconnected_at).toBe(
      "2026-07-25T22:08:43.897+00:00",
    );
    expect(userResult.connection?.last_error_json).toEqual({
      at: "2026-07-25T22:08:43.897Z",
      code: "callback_failed",
      description: null,
      http_status: null,
    });

    const maybeSingleService = vi.fn().mockResolvedValue({
      data: {
        ...productionRow,
        encrypted_access_token: null,
        encrypted_refresh_token: "encrypted-refresh-token",
      },
      error: null,
    });
    const eqService = vi
      .fn()
      .mockReturnValue({ maybeSingle: maybeSingleService });
    const selectService = vi.fn().mockReturnValue({ eq: eqService });
    const serviceClient = {
      from: vi.fn().mockReturnValue({ select: selectService }),
    };
    mocks.requireSupabaseServerUser.mockResolvedValue({
      client: userClient,
      user: { id: "bf369e8a-8b2b-4d73-b611-8f62999d510f" },
    });
    mocks.requireSupabaseServiceRoleClient.mockReturnValue(serviceClient);

    const storedResult = await getGoogleCalendarStoredConnectionForAccessToken(
      "supabase-access-token",
    );

    expect(storedResult.connection?.encrypted_refresh_token).toBe(
      "encrypted-refresh-token",
    );
    expect(storedResult.connection?.created_at).toBe(
      "2026-05-28T18:09:22.314246+00:00",
    );
  });

  it("drops a malformed last_error_json instead of failing the whole row (#743)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        ...storedConnection,
        // Missing the required `code` field -- simulates corrupted or
        // hand-edited diagnostics data reaching the read path.
        last_error_json: { description: "no code here", at: "bad" },
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const client = { from: vi.fn().mockReturnValue({ select }) };
    mocks.requireSupabaseServerUser.mockResolvedValue({ client, user });

    const result = await getGoogleCalendarConnectionForAccessToken(
      "supabase-access-token",
    );

    expect(result.connection?.last_error_json ?? null).toBeNull();
    expect(result.connection?.status).toBe("connected");
  });
});
