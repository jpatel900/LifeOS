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
        },
        async () => ({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("stays non-blocking when provider env vars exist but runtime hooks are not registered", async () => {
    resetObservabilityRuntime();

    const observability = createObservability({
      env: {
        NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
        NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
        LANGFUSE_PUBLIC_KEY: "pk-lf-public",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
      },
    });

    await expect(
      observability.captureError({
        feature: "health",
        error: new Error("failure"),
      }),
    ).resolves.toBeUndefined();
    await expect(
      observability.captureEvent({
        event: "health_viewed",
        properties: {
          feature: "health",
          status: "opened",
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      observability.traceParseCapture(
        {
          parser: "mock",
          provider: "mock",
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

  it("routes metadata-only parse_capture traces through the registered Langfuse runtime", async () => {
    const traceAiOperationSpy = vi.fn();
    const traceAiOperation = async <T>(
      input: {
        feature: string;
        operation: string;
        metadata: Record<string, string | number | boolean | null>;
        finalizeMetadata?: (outcome: {
          ok: true;
          value: unknown;
        } | {
          ok: false;
          error: unknown;
        }) => Record<string, string | number | boolean | null>;
      },
      run: () => Promise<T>,
    ) => {
      traceAiOperationSpy(input);
      expect(input.metadata).toEqual({
        fallback_used: false,
        model_name: "gpt-4o-mini",
        model_tier_label: "standard",
        operation: "parse_capture",
        parser: "ai",
        provider: "openai",
      });

      const value = await run();

      expect(input.finalizeMetadata?.({ ok: true, value })).toEqual({
        input_token_count: 12,
        output_token_count: 18,
        parse_status: "parsed",
        prompt_version: "parse_capture.v1",
        schema_version: "1.0",
        status: "succeeded",
        total_token_count: 30,
        validation_status: "validated",
      });

      return value;
    };

    resetObservabilityRuntime();
    registerObservabilityRuntime({
      langfuse: {
        transportMode: "langfuse_sdk",
        traceAiOperation,
      },
    });

    const observability = createObservability({
      env: {
        LANGFUSE_PUBLIC_KEY: "pk-lf-public",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
      },
    });

    await observability.traceParseCapture(
      {
        parser: "ai",
        provider: "openai",
        metadata: {
          fallback_used: false,
          model_name: "gpt-4o-mini",
          model_tier_label: "standard",
          raw_text: "never export this",
        },
        finalizeMetadata: () => ({
          input_token_count: 12,
          output_token_count: 18,
          parse_status: "parsed",
          prompt: "never export this either",
          prompt_version: "parse_capture.v1",
          schema_version: "1.0",
          status: "succeeded",
          title: "private task title",
          total_token_count: 30,
          validation_status: "validated",
        }),
      },
      async () => ({ ok: true }),
    );

    expect(traceAiOperationSpy).toHaveBeenCalledTimes(1);

    resetObservabilityRuntime();
  });
});
