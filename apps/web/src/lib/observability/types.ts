export type ObservabilityProvider = "sentry" | "posthog" | "langfuse";

export type ObservabilityProviderState =
  | "disabled"
  | "missing_config"
  | "configured"
  | "invalid_config";

export interface ObservabilityProviderStatus {
  provider: ObservabilityProvider;
  state: ObservabilityProviderState;
  requiredKeys: string[];
  missingKeys: string[];
  invalidKeys: string[];
  transportMode: "noop";
}

export interface ObservabilityGuardrails {
  networkTelemetryEnabled: false;
  sessionReplayEnabled: false;
  autocaptureEnabled: false;
  aiContentTracingEnabled: false;
}

export interface ObservabilityHealthSnapshot {
  providers: ObservabilityProviderStatus[];
  guardrails: ObservabilityGuardrails;
  environmentName: string;
}

export type ObservabilityPrimitive = string | number | boolean | null;

export type SanitizedObservabilityValue =
  | ObservabilityPrimitive
  | SanitizedObservabilityValue[]
  | { [key: string]: SanitizedObservabilityValue };

export interface CaptureErrorInput {
  feature: string;
  error: unknown;
  context?: Record<string, unknown>;
}

export interface CaptureEventInput {
  event: string;
  properties?: Record<string, unknown>;
}

export interface TraceAiOperationInput {
  feature: string;
  operation: string;
  metadata?: Record<string, unknown>;
}

export interface TraceParseCaptureInput {
  parser: "ai" | "mock";
  parseStatus: string;
  metadata?: Record<string, unknown>;
}

export interface ObservabilityAdapter {
  provider: ObservabilityProvider;
  status: ObservabilityProviderStatus;
  captureError?: (input: {
    feature: string;
    error: SanitizedObservabilityValue;
    context: SanitizedObservabilityValue;
  }) => void | Promise<void>;
  captureEvent?: (input: {
    event: string;
    properties: Record<string, ObservabilityPrimitive>;
  }) => void | Promise<void>;
  traceAiOperation?: <T>(
    input: {
      feature: string;
      operation: string;
      metadata: Record<string, ObservabilityPrimitive>;
    },
    run: () => Promise<T>,
  ) => Promise<T>;
  flush?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}

