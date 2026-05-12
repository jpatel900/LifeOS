import {
  getObservabilityHealthSnapshot,
  type ObservabilityEnv,
} from "./config";
import {
  sanitizeEventProperties,
  sanitizeObservabilityValue,
} from "./sanitize";
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

function getDefaultAdapters(env: ObservabilityEnv = process.env) {
  return getObservabilityHealthSnapshot(env).providers.map(createNoopAdapter);
}

export function createObservability(
  options: CreateObservabilityOptions = {},
) {
  const adapters = options.adapters ?? getDefaultAdapters(options.env);

  const activeAdapters = adapters.filter(
    (adapter) => adapter.status.state === "configured",
  );

  return {
    async captureError(input: CaptureErrorInput) {
      const payload = {
        feature: input.feature,
        error: sanitizeObservabilityValue(input.error),
        context: sanitizeObservabilityValue(input.context ?? {}),
      };

      for (const adapter of activeAdapters) {
        await adapter.captureError?.(payload);
      }
    },

    async captureEvent(input: CaptureEventInput) {
      const payload = {
        event: input.event,
        properties: sanitizeEventProperties(input.properties),
      };

      for (const adapter of activeAdapters) {
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
      for (const adapter of activeAdapters) {
        await adapter.flush?.();
      }
    },

    async shutdown() {
      for (const adapter of activeAdapters) {
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
export * from "./sanitize";
export * from "./types";
