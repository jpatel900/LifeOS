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
  transportMode: "noop" | "sentry_sdk" | "posthog_js" | "langfuse_sdk";
}

export interface ObservabilityGuardrails {
  networkTelemetryEnabled: boolean;
  sessionReplayEnabled: boolean;
  autocaptureEnabled: boolean;
  aiContentTracingEnabled: boolean;
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
  event: ObservabilityEventName;
  properties?: Record<string, unknown>;
}

export const OBSERVABILITY_EVENT_NAMES = [
  "capture_submitted",
  "parse_succeeded",
  "parse_failed",
  "triage_item_accepted",
  "task_created",
  "project_created",
  "proposal_created",
  "conflict_check_requested",
  "calendar_write_approved",
  "calendar_write_succeeded",
  "calendar_write_failed",
  "execution_started",
  "execution_completed",
  "review_submitted",
  "health_viewed",
] as const;

export type ObservabilityEventName = (typeof OBSERVABILITY_EVENT_NAMES)[number];

export interface TraceAiOperationInput {
  feature: string;
  operation: string;
  metadata?: Record<string, unknown>;
  finalizeMetadata?: (
    outcome: TraceAiOperationOutcome,
  ) => Record<string, unknown>;
}

export interface TraceParseCaptureInput {
  parser: "ai" | "mock";
  provider?: "openai" | "mock";
  metadata?: Record<string, unknown>;
  finalizeMetadata?: (
    outcome: TraceAiOperationOutcome,
  ) => Record<string, unknown>;
}

export type TraceAiOperationOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: unknown };

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
      finalizeMetadata?: (
        outcome: TraceAiOperationOutcome,
      ) => Record<string, ObservabilityPrimitive>;
    },
    run: () => Promise<T>,
  ) => Promise<T>;
  flush?: () => Promise<void>;
  shutdown?: () => Promise<void>;
}
