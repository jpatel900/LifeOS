import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-029 session-refresh middleware contract:
 * - demo mode (Supabase unconfigured) is a pure pass-through — no client
 *   construction at all;
 * - configured mode constructs a cookie-bridged server client and calls
 *   auth.getUser() to force a token refresh;
 * - the middleware never redirects (no route protection lives here).
 */

const createServerClientMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => {
    createServerClientMock(...args);
    return { auth: { getUser: getUserMock } };
  },
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: vi.fn(),
}));

import { middleware } from "./middleware";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { NextRequest } from "next/server";

function makeRequest() {
  return new NextRequest("http://localhost/capture");
}

describe("session-refresh middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("passes through without touching Supabase when unconfigured (demo mode)", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue(null);

    const response = await middleware(makeRequest());

    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("refreshes the session via getUser() when configured", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "local-anon-key",
    });

    const response = await middleware(makeRequest());

    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(createServerClientMock).toHaveBeenCalledWith(
      "http://127.0.0.1:15431",
      "local-anon-key",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
    expect(getUserMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never redirects even for a signed-out visitor", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "local-anon-key",
    });
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "Auth session missing!" },
    });

    const response = await middleware(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
