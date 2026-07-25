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
