import {
  getObservabilityHealthSnapshot,
  type ObservabilityEnv,
} from "./config";
import {
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
    !runtime.captureException
  ) {
    return createNoopAdapter(status);
  }

  const adapter: ObservabilityAdapter = {
    provider: "sentry",
    status: {
      ...status,
      transportMode: runtime.transportMode,
    },
    async captureError(input) {
      await runtime.captureException?.(input);
    },
    async flush() {
      await runtime.flush?.();
    },
    async shutdown() {
      await runtime.shutdown?.();
    },
  };

  return adapter;
}

function getDefaultAdapters(env: ObservabilityEnv = process.env) {
  return getObservabilityHealthSnapshot(env).providers.map((status) =>
    status.provider === "sentry"
      ? createSentryAdapter(status)
      : createNoopAdapter(status),
  );
}

export function createObservability(
  options: CreateObservabilityOptions = {},
) {
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
            provider: input.parser,
            parse_status: input.parseStatus,
            ...input.metadata,
          },
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

export const captureError = defaultObservability.captureError.bind(
  defaultObservability,
);
export const captureEvent = defaultObservability.captureEvent.bind(
  defaultObservability,
);
export const traceAiOperation = defaultObservability.traceAiOperation.bind(
  defaultObservability,
);
export const traceParseCapture = defaultObservability.traceParseCapture.bind(
  defaultObservability,
);
export const flushObservability = defaultObservability.flush.bind(
  defaultObservability,
);
export const shutdownObservability = defaultObservability.shutdown.bind(
  defaultObservability,
);

export * from "./config";
export * from "./runtime";
export * from "./sanitize";
export * from "./sentry";
export * from "./types";
