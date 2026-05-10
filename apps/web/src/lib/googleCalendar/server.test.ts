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
});
