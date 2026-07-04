import {
  getObservabilityHealthSnapshot,
  type ObservabilityEnv,
} from "./config";
import {
  isAllowedObservabilityEventName,
  sanitizeEventProperties,
  sanitizeObservabilityValue,
} from "./sanitize";
import { getObservabilityRuntime } from "./runtime";
import type {
  CaptureErrorInput,
  CaptureEventInput,
  ObservabilityAdapter,
  ObservabilityProviderStatus,
  TraceAiOperationInput,
  TraceParseCaptureInput,
} from "./types";

interface CreateObservabilityOptions {
  adapters?: ObservabilityAdapter[];
  env?: ObservabilityEnv;
}

function createNoopAdapter(status: ObservabilityProviderStatus) {
  const adapter: ObservabilityAdapter = {
    provider: status.provider,
    status,
    async traceAiOperation<T>(
      _input: {
        feature: string;
        operation: string;
        metadata: Record<string, string | number | boolean | null>;
      },
      run: () => Promise<T>,
    ) {
      return run();
    },
    async flush() {},
    async shutdown() {},
  };

  return adapter;
}

function createSentryAdapter(status: ObservabilityProviderStatus) {
  const runtime = getObservabilityRuntime();

  if (
    status.state !== "configured" ||
    status.provider !== "sentry" ||
    !runtime.sentry?.captureException
  ) {
    return createNoopAdapter(status);
  }

  const adapter: ObservabilityAdapter = {
    provider: "sentry",
    status: {
      ...status,
      transportMode: runtime.sentry.transportMode,
    },
    async captureError(input) {
      await runtime.sentry?.captureException(input);
    },
    async flush() {
      await runtime.sentry?.flush?.();
    },
    async shutdown() {
      await runtime.sentry?.shutdown?.();
    },
  };

  return adapter;
}

function createPostHogAdapter(status: ObservabilityProviderStatus) {
  const runtime = getObservabilityRuntime();

  if (
    status.state !== "configured" ||
    status.provider !== "posthog" ||
    !runtime.posthog?.captureEvent
  ) {
    return createNoopAdapter(status);
  }

  const adapter: ObservabilityAdapter = {
    provider: "posthog",
    status: {
      ...status,
      transportMode: runtime.posthog.transportMode,
    },
    async captureEvent(input) {
      await runtime.posthog?.captureEvent(input);
    },
    async flush() {
      await runtime.posthog?.flush?.();
    },
    async shutdown() {
      await runtime.posthog?.shutdown?.();
    },
  };

  return adapter;
}

function createLangfuseAdapter(status: ObservabilityProviderStatus) {
  const runtime = getObservabilityRuntime();

  if (
    status.state !== "configured" ||
    status.provider !== "langfuse" ||
    !runtime.langfuse?.traceAiOperation
  ) {
    return createNoopAdapter(status);
  }

  const adapter: ObservabilityAdapter = {
    provider: "langfuse",
    status: {
      ...status,
      transportMode: runtime.langfuse.transportMode,
    },
    async traceAiOperation(input, run) {
      return runtime.langfuse?.traceAiOperation(input, run) ?? run();
    },
    async flush() {
      await runtime.langfuse?.flush?.();
    },
    async shutdown() {
      await runtime.langfuse?.shutdown?.();
    },
  };

  return adapter;
}

function getDefaultAdapters(env: ObservabilityEnv = process.env) {
  return getObservabilityHealthSnapshot(env).providers.map((status) =>
    status.provider === "sentry"
      ? createSentryAdapter(status)
      : status.provider === "posthog"
        ? createPostHogAdapter(status)
        : status.provider === "langfuse"
          ? createLangfuseAdapter(status)
          : createNoopAdapter(status),
  );
}

export function createObservability(options: CreateObservabilityOptions = {}) {
  const getActiveAdapters = () =>
    (options.adapters ?? getDefaultAdapters(options.env)).filter(
      (adapter) => adapter.status.state === "configured",
    );

  return {
    async captureError(input: CaptureErrorInput) {
      const payload = {
        feature: input.feature,
        error: sanitizeObservabilityValue(input.error),
        context: sanitizeObservabilityValue(input.context ?? {}),
      };

      for (const adapter of getActiveAdapters()) {
        await adapter.captureError?.(payload);
      }
    },

    async captureEvent(input: CaptureEventInput) {
      if (!isAllowedObservabilityEventName(input.event)) {
        return;
      }

      const payload = {
        event: input.event,
        properties: sanitizeEventProperties(input.properties),
      };

      for (const adapter of getActiveAdapters()) {
        await adapter.captureEvent?.(payload);
      }
    },

    async traceAiOperation<T>(
      input: TraceAiOperationInput,
      run: () => Promise<T>,
    ) {
      const payload = {
        feature: input.feature,
        operation: input.operation,
        metadata: sanitizeEventProperties(input.metadata),
        finalizeMetadata: input.finalizeMetadata
          ? (
              outcome:
                | { ok: true; value: unknown }
                | { ok: false; error: unknown },
            ) => sanitizeEventProperties(input.finalizeMetadata?.(outcome))
          : undefined,
      };

      const activeAdapters = getActiveAdapters();

      if (activeAdapters.length === 0) {
        return run();
      }

      let chain = run;

      for (const adapter of [...activeAdapters].reverse()) {
        const trace = adapter.traceAiOperation;
        if (!trace) {
          continue;
        }

        const next = chain;
        chain = () => trace(payload, next);
      }

      return chain();
    },

    async traceParseCapture<T>(
      input: TraceParseCaptureInput,
      run: () => Promise<T>,
    ) {
      return this.traceAiOperation(
        {
          feature: "parse_capture",
          operation: "parse_capture",
          metadata: {
            operation: "parse_capture",
            parser: input.parser,
            provider:
              input.provider ?? (input.parser === "ai" ? "openai" : "mock"),
            ...input.metadata,
          },
          finalizeMetadata: input.finalizeMetadata,
        },
        run,
      );
    },

    async flush() {
      for (const adapter of getActiveAdapters()) {
        await adapter.flush?.();
      }
    },

    async shutdown() {
      for (const adapter of getActiveAdapters()) {
        await adapter.shutdown?.();
      }
    },
  };
}

const defaultObservability = createObservability();

export const captureError =
  defaultObservability.captureError.bind(defaultObservability);
export const captureEvent =
  defaultObservability.captureEvent.bind(defaultObservability);
export const traceAiOperation =
  defaultObservability.traceAiOperation.bind(defaultObservability);
export const traceParseCapture =
  defaultObservability.traceParseCapture.bind(defaultObservability);
export const flushObservability =
  defaultObservability.flush.bind(defaultObservability);
export const shutdownObservability =
  defaultObservability.shutdown.bind(defaultObservability);

export * from "./aiCallTraces";
export * from "./config";
export * from "./langfuse";
export * from "./runtime";
export * from "./sanitize";
export * from "./sentry";
export * from "./types";
