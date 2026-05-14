import type { SanitizedObservabilityValue } from "./types";

interface SentryRuntimeHooks {
  transportMode: "sentry_sdk";
  captureException: (input: {
    error: SanitizedObservabilityValue;
    feature: string;
    context: SanitizedObservabilityValue;
  }) => void | Promise<void>;
  flush?: (timeoutMs?: number) => void | Promise<void>;
  shutdown?: (timeoutMs?: number) => void | Promise<void>;
}

interface PostHogRuntimeHooks {
  transportMode: "posthog_js";
  captureEvent: (input: {
    event: string;
    properties: Record<string, string | number | boolean | null>;
  }) => void | Promise<void>;
  flush?: () => void | Promise<void>;
  shutdown?: () => void | Promise<void>;
}

interface LangfuseRuntimeHooks {
  transportMode: "langfuse_sdk";
  traceAiOperation: <T>(
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
  ) => Promise<T>;
  flush?: () => void | Promise<void>;
  shutdown?: () => void | Promise<void>;
}

export interface ObservabilityRuntimeHooks {
  sentry?: SentryRuntimeHooks;
  posthog?: PostHogRuntimeHooks;
  langfuse?: LangfuseRuntimeHooks;
}

declare global {
  var __LIFEOS_OBSERVABILITY_RUNTIME__: ObservabilityRuntimeHooks | undefined;
}

export function getObservabilityRuntime(): ObservabilityRuntimeHooks {
  return globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__ ?? {};
}

export function registerObservabilityRuntime(
  hooks: ObservabilityRuntimeHooks,
) {
  globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__ = {
    ...(globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__ ?? {}),
    ...hooks,
  };
}

export function resetObservabilityRuntime() {
  delete globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__;
}
