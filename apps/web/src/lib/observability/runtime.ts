import type { SanitizedObservabilityValue } from "./types";

export interface ObservabilityRuntimeHooks {
  transportMode: "noop" | "sentry_sdk";
  captureException?: (input: {
    error: SanitizedObservabilityValue;
    feature: string;
    context: SanitizedObservabilityValue;
  }) => void | Promise<void>;
  flush?: (timeoutMs?: number) => void | Promise<void>;
  shutdown?: (timeoutMs?: number) => void | Promise<void>;
}

declare global {
  var __LIFEOS_OBSERVABILITY_RUNTIME__: ObservabilityRuntimeHooks | undefined;
}

export function getObservabilityRuntime(): ObservabilityRuntimeHooks {
  return (
    globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__ ?? {
      transportMode: "noop",
    }
  );
}

export function registerObservabilityRuntime(
  hooks: ObservabilityRuntimeHooks,
) {
  globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__ = hooks;
}

export function resetObservabilityRuntime() {
  delete globalThis.__LIFEOS_OBSERVABILITY_RUNTIME__;
}
