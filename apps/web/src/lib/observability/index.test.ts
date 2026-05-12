import { describe, expect, it, vi } from "vitest";
import { createObservability } from "./index";
import type { ObservabilityAdapter } from "./types";

describe("observability wrapper", () => {
  it("no-ops provider adapters when they are disabled", async () => {
    const captureError = vi.fn();
    const captureEvent = vi.fn();
    const traceAiOperation = vi.fn();
    const flush = vi.fn();
    const shutdown = vi.fn();

    const adapter: ObservabilityAdapter = {
      provider: "sentry",
      status: {
        provider: "sentry",
        state: "disabled",
        requiredKeys: ["NEXT_PUBLIC_SENTRY_DSN"],
        missingKeys: [],
        invalidKeys: [],
        transportMode: "noop",
      },
      captureError,
      captureEvent,
      traceAiOperation,
      flush,
      shutdown,
    };

    const observability = createObservability({
      adapters: [adapter],
    });

    await observability.captureError({
      feature: "parse_capture",
      error: new Error("failure"),
      context: { provider: "mock" },
    });
    await observability.captureEvent({
      event: "parse_capture_attempted",
      properties: { provider: "mock" },
    });
    const value = await observability.traceAiOperation(
      {
        feature: "parse_capture",
        operation: "parse_capture",
        metadata: { provider: "mock" },
      },
      async () => "ok",
    );
    await observability.flush();
    await observability.shutdown();

    expect(value).toBe("ok");
    expect(captureError).not.toHaveBeenCalled();
    expect(captureEvent).not.toHaveBeenCalled();
    expect(traceAiOperation).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("stays non-blocking when env vars are missing", async () => {
    const observability = createObservability({ env: {} });

    await expect(
      observability.captureError({
        feature: "health",
        error: new Error("failure"),
      }),
    ).resolves.toBeUndefined();
    await expect(
      observability.captureEvent({
        event: "health_snapshot_loaded",
      }),
    ).resolves.toBeUndefined();
    await expect(
      observability.traceParseCapture(
        {
          parser: "mock",
          parseStatus: "parsed",
        },
        async () => ({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });
  });
});
