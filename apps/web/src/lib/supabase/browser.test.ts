import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-029: the browser client must come from @supabase/ssr's cookie-backed
 * createBrowserClient (session survives restarts; middleware can refresh it),
 * stay a singleton, and keep returning null in demo mode.
 */

const createBrowserClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: (...args: unknown[]) => {
    createBrowserClientMock(...args);
    return { from: vi.fn(), auth: {} };
  },
}));

vi.mock("./config", () => ({
  getSupabaseConfig: vi.fn(),
}));

import { getSupabaseConfig } from "./config";

async function freshModule() {
  vi.resetModules();
  return import("./browser");
}

describe("createSupabaseBrowserClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null in demo mode and caches the null", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue(null);
    const { createSupabaseBrowserClient } = await freshModule();

    expect(createSupabaseBrowserClient()).toBeNull();
    expect(createSupabaseBrowserClient()).toBeNull();
    expect(getSupabaseConfig).toHaveBeenCalledTimes(1);
    expect(createBrowserClientMock).not.toHaveBeenCalled();
  });

  it("builds one cookie-backed client and reuses it", async () => {
    vi.mocked(getSupabaseConfig).mockReturnValue({
      url: "http://127.0.0.1:15431",
      anonKey: "local-anon-key",
    });
    const { createSupabaseBrowserClient } = await freshModule();

    const first = createSupabaseBrowserClient();
    const second = createSupabaseBrowserClient();

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "http://127.0.0.1:15431",
      "local-anon-key",
    );
  });
});
