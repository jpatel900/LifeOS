// W3-16 finding 6: the OAuth callback checks that the Supabase token in the
// sealed state belongs to the user the state was sealed for. Its failure
// path then calls `markConnectionError`, which writes through the
// service-role client. The existing route tests mock the cookie decoder, the
// state check and the storage helpers, so they cannot show that BOTH
// ownership guards hold together. This file keeps the real sealing, state
// check and storage helpers, and fakes only the auth lookup, the
// service-role client and the network.
//
// Every value below is synthetic. No real Google or Supabase call is made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  sealGoogleCalendarOAuthStateCookie,
} from "@/lib/googleCalendar/oauth";
import { GET } from "./route";

const USER_A = "550e8400-e29b-41d4-a716-44665544000a";
const USER_B = "550e8400-e29b-41d4-a716-44665544000b";
const STATE = "synthetic-state-value";
const SUPABASE_TOKEN = "synthetic-supabase-token";

function callbackRequest(cookieValue: string, query = `code=synthetic-code`) {
  return new Request(
    `http://localhost/api/google-calendar/callback?state=${STATE}&${query}`,
    {
      headers: {
        cookie: `${GOOGLE_CALENDAR_OAUTH_STATE_COOKIE}=${encodeURIComponent(
          cookieValue,
        )}`,
      },
    },
  );
}

function sealedStateFor(userId: string) {
  return sealGoogleCalendarOAuthStateCookie({
    accessToken: SUPABASE_TOKEN,
    state: STATE,
    userId,
  });
}

function serviceRoleSpy() {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: "550e8400-e29b-41d4-a716-446655440901",
      user_id: USER_A,
      provider: "google_calendar",
      calendar_id: "primary",
      granted_scopes_json: [],
      status: "connected",
      first_write_warning_acknowledged_at: null,
      connected_at: "2026-10-23T00:00:00.000Z",
      disconnected_at: null,
      last_error_json: null,
      created_at: "2026-10-23T00:00:00.000Z",
      updated_at: "2026-10-23T00:00:00.000Z",
    },
    error: null,
  });
  const upsertSelect = vi.fn().mockReturnValue({ single });
  const upsert = vi.fn().mockReturnValue({ select: upsertSelect });
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const client = { from: vi.fn().mockReturnValue({ select, upsert }) };
  mocks.requireSupabaseServiceRoleClient.mockReturnValue(client);
  return { client, upsert };
}

function clearedStateCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  return (
    setCookie.includes(`${GOOGLE_CALENDAR_OAUTH_STATE_COOKIE}=;`) &&
    /max-age=0/i.test(setCookie)
  );
}

describe("google-calendar callback identity guards (W3-16 #6)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv(
      "GOOGLE_REDIRECT_URI",
      "http://localhost/api/google-calendar/callback",
    );
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "token-encryption-key");
    fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "synthetic-google-access",
            refresh_token: "synthetic-google-refresh",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/calendar.events.owned",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("state sealed for A but a token that authenticates B: auth_required, no exchange, no service-role write", async () => {
    const { client, upsert } = serviceRoleSpy();
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: USER_B },
    });

    const response = await GET(callbackRequest(sealedStateFor(USER_A)));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/settings/areas");
    expect(location.searchParams.get("googleCalendarError")).toBe(
      "auth_required",
    );
    expect(clearedStateCookie(response)).toBe(true);
    // Zero Google code exchanges, so zero tokens were ever encrypted.
    expect(fetchSpy).not.toHaveBeenCalled();
    // The failure path's `markConnectionError` reached the real helper, whose
    // own ownership check refused before any service-role client existed.
    expect(mocks.requireSupabaseServerUser).toHaveBeenCalledWith(
      SUPABASE_TOKEN,
    );
    expect(mocks.requireSupabaseServiceRoleClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("the same mismatch with a provider error still writes nothing", async () => {
    serviceRoleSpy();
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: USER_B },
    });

    const response = await GET(
      callbackRequest(sealedStateFor(USER_A), "error=access_denied"),
    );

    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get(
        "googleCalendarError",
      ),
    ).toBe("auth_required");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.requireSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("control: a tampered state cookie is refused before any auth lookup", async () => {
    serviceRoleSpy();
    const sealed = sealedStateFor(USER_A);
    const [iv, ciphertext, tag] = sealed.split(".");
    const flipped = `${ciphertext!.slice(0, -2)}${
      ciphertext!.endsWith("AA") ? "BB" : "AA"
    }`;

    const response = await GET(callbackRequest([iv, flipped, tag].join(".")));

    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get(
        "googleCalendarError",
      ),
    ).toBe("invalid_state");
    expect(clearedStateCookie(response)).toBe(true);
    expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.requireSupabaseServiceRoleClient).not.toHaveBeenCalled();
  });

  it("control: an expired state is refused before any auth lookup", async () => {
    serviceRoleSpy();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
      const sealed = sealedStateFor(USER_A);
      vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"));

      const response = await GET(callbackRequest(sealed));

      expect(
        new URL(response.headers.get("location") ?? "").searchParams.get(
          "googleCalendarError",
        ),
      ).toBe("invalid_state");
      expect(mocks.requireSupabaseServerUser).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("control: matching identities exchange the code once and store the connection for that user", async () => {
    const { upsert } = serviceRoleSpy();
    mocks.requireSupabaseServerUser.mockResolvedValue({
      user: { id: USER_A },
    });

    const response = await GET(callbackRequest(sealedStateFor(USER_A)));

    expect(
      new URL(response.headers.get("location") ?? "").searchParams.get(
        "googleCalendar",
      ),
    ).toBe("connected");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [values] = upsert.mock.calls[0]!;
    expect(values.user_id).toBe(USER_A);
    expect(values.status).toBe("connected");
    // Stored token material is the encrypted envelope, never the raw token.
    expect(JSON.stringify(values)).not.toContain("synthetic-google-access");
    expect(JSON.stringify(values)).not.toContain("synthetic-google-refresh");
  });
});
