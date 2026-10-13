import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  parse: vi.fn(),
  client: vi.fn(),
  getUser: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("@/lib/ai/parseCaptureService", () => ({
  getParseCaptureStatus: mocks.status,
  parseCaptureWithFallback: mocks.parse,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.client,
}));
vi.mock("@/lib/observability", () => ({ captureError: mocks.captureError }));
import { POST } from "./route";
import { requestParseCapture } from "@/lib/ai/parseCaptureClient";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const validUser = { data: { user: { id: "synthetic-user" } }, error: null };
function request() {
  return new Request("http://localhost/api/parse-capture", {
    method: "POST",
    headers: {
      Authorization: "Bearer synthetic-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rawText: "Synthetic auth thought" }),
  });
}
describe("parse-capture bounded authentication", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.status.mockReturnValue({
      status: "ai_configured",
      preferredParser: "ai",
    });
    mocks.client.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue(validUser);
    mocks.parse.mockResolvedValue({ parser: "ai", response: {} });
  });
  afterEach(() => vi.useRealTimers());
  it.each(["resolve", "reject"] as const)(
    "settles stalled auth and ignores late %s without calling provider",
    async (outcome) => {
      const auth = deferred<typeof validUser>();
      mocks.getUser.mockReturnValueOnce(auth.promise);
      let response: Response | undefined;
      const pending = POST(request()).then((value) => {
        response = value;
      });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(response?.status).toBe(503);
      expect(await response?.json()).toEqual({
        ok: false,
        errorCategory: "auth_unavailable",
        can_retry_with_mock: false,
        error: "Sign-in could not be checked. Try sorting again.",
      });
      expect(mocks.parse).not.toHaveBeenCalled();
      if (outcome === "resolve") auth.resolve(validUser);
      else auth.reject(new Error("private synthetic auth details"));
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.parse).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      await pending;
    },
  );
  it("returns a controlled sanitized error when auth rejects", async () => {
    mocks.getUser.mockRejectedValueOnce(
      new Error("private synthetic auth details"),
    );
    const response = await POST(request()).catch(() => undefined);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({
      ok: false,
      errorCategory: "auth_unavailable",
      can_retry_with_mock: false,
      error: "Sign-in could not be checked. Try sorting again.",
    });
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.captureError).not.toHaveBeenCalled();
  });
  it("passes the auth error through the client without offering mock retry", async () => {
    mocks.getUser.mockRejectedValueOnce(
      new Error("private synthetic auth details"),
    );
    const result = await requestParseCapture({
      rawText: "Synthetic auth thought",
      parserMode: "auto",
      authorization: "Bearer synthetic-token",
      fetchImpl: (async () => POST(request())) as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      status: "unknown",
      error: "Sign-in could not be checked. Try sorting again.",
      canRetryWithMock: false,
    });
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("preserves invalid-token401", async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("invalid synthetic token"),
    });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      errorCategory: "auth_rejected",
    });
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("allows successful auth just before its budget ends, then the provider budget", async () => {
    const auth = deferred<typeof validUser>();
    const provider = deferred<{ parser: string; response: object }>();
    mocks.getUser.mockReturnValueOnce(auth.promise);
    mocks.parse.mockReturnValueOnce(provider.promise);
    let response: Response | undefined;
    const pending = POST(request()).then((value) => {
      response = value;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    auth.resolve(validUser);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    provider.resolve({ parser: "ai", response: {} });
    await pending;
    expect(response?.status).toBe(200);
    expect(vi.getTimerCount()).toBe(0);
  });
});
