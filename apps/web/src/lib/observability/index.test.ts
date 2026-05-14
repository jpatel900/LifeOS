import { describe, expect, it, vi } from "vitest";
import { createObservability } from "./index";
import {
  registerObservabilityRuntime,
  resetObservabilityRuntime,
} from "./runtime";
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
      event: "parse_failed",
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
        event: "health_viewed",
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

  it("uses the registered Sentry runtime only when Sentry is configured", async () => {
    const captureException = vi.fn();
    const flush = vi.fn();
    const shutdown = vi.fn();

    resetObservabilityRuntime();
    registerObservabilityRuntime({
      sentry: {
        transportMode: "sentry_sdk",
        captureException,
        flush,
        shutdown,
      },
    });

    const observability = createObservability({
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
      },
    });

    await observability.captureError({
      feature: "parse_capture",
      error: new Error("failure"),
      context: {
        feature: "capture",
        prompt: "never export this",
      },
    });
    await observability.flush();
    await observability.shutdown();

    expect(captureException).toHaveBeenCalledWith({
      feature: "parse_capture",
      error: {
        name: "Error",
        message: "failure",
        stack_present: true,
      },
      context: {
        feature: "capture",
        prompt: "[REDACTED]",
      },
    });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(shutdown).toHaveBeenCalledTimes(1);

    resetObservabilityRuntime();
  });

  it("drops analytics calls for events outside the approved taxonomy", async () => {
    const captureEvent = vi.fn();

    resetObservabilityRuntime();
    registerObservabilityRuntime({
      posthog: {
        transportMode: "posthog_js",
        captureEvent,
      },
    });

    const observability = createObservability({
      env: {
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      },
    });

    await observability.captureEvent({
      event: "not_allowed_event" as never,
      properties: {
        feature: "capture",
        status: "submitted",
      },
    });

    expect(captureEvent).not.toHaveBeenCalled();

    resetObservabilityRuntime();
  });

  it("routes approved manual analytics through the registered PostHog runtime", async () => {
    const captureEvent = vi.fn();

    resetObservabilityRuntime();
    registerObservabilityRuntime({
      posthog: {
        transportMode: "posthog_js",
        captureEvent,
      },
    });

    const observability = createObservability({
      env: {
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      },
    });

    await observability.captureEvent({
      event: "calendar_write_failed",
      properties: {
        feature: "calendar",
        provider: "google_calendar",
        status: "failed",
        error_category: "google_calendar_write_failed",
        raw_text: "drop this",
      },
    });

    expect(captureEvent).toHaveBeenCalledWith({
      event: "calendar_write_failed",
      properties: {
        error_category: "google_calendar_write_failed",
        feature: "calendar",
        provider: "google_calendar",
        status: "failed",
      },
    });

    resetObservabilityRuntime();
  });
});
