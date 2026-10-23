import { afterEach, describe, expect, it, vi } from "vitest";
import { requestParseCapture } from "./parseCaptureClient";
import { PARSE_CAPTURE_CLIENT_DEADLINE_MS } from "./requestDeadline";
afterEach(() => vi.useRealTimers());
describe("client generic Sort recovery", () => {
  it("preserves the route's sign-in recovery without offering basic sorting", async () => {
    const result = await requestParseCapture({
      rawText: "Synthetic recovery",
      parserMode: "auto",
      fetchImpl: vi.fn(async () =>
        Response.json(
          {
            ok: false,
            error:
              "Sign in, then try sorting again. Your thought is still saved, exactly as you wrote it.",
            can_retry_with_mock: false,
          },
          { status: 401 },
        ),
      ),
    });
    expect(result).toEqual({
      ok: false,
      status: "unknown",
      error:
        "Sign in, then try sorting again. Your thought is still saved, exactly as you wrote it.",
      canRetryWithMock: false,
    });
  });

  it("gives signed-in recovery when transport fails", async () => {
    const result = await requestParseCapture({
      rawText: "Synthetic recovery",
      parserMode: "auto",
      authorization: "Bearer synthetic-token",
      fetchImpl: vi.fn(async () => {
        throw new Error("synthetic transport failure");
      }),
    });
    expect(result).toMatchObject({
      ok: false,
      error:
        "LifeOS couldn't sort this one just now. Your thought is still saved, exactly as you wrote it. Try again, or use basic sorting.",
      canRetryWithMock: true,
    });
  });
  it("names the timeout after a stalled request reaches the client deadline", async () => {
    vi.useFakeTimers();
    const pending = requestParseCapture({
      rawText: "Synthetic timeout",
      parserMode: "auto",
      authorization: "Bearer synthetic-token",
      fetchImpl: vi.fn(() => new Promise<Response>(() => {})),
    });
    await vi.advanceTimersByTimeAsync(PARSE_CAPTURE_CLIENT_DEADLINE_MS);
    expect(await pending).toMatchObject({
      ok: false,
      error:
        "Sorting took too long. Your thought is still saved, exactly as you wrote it. Try again, or use basic sorting.",
      canRetryWithMock: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
