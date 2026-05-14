import type {
  ObservabilityGuardrails,
  ObservabilityHealthSnapshot,
  ObservabilityProvider,
  ObservabilityProviderState,
  ObservabilityProviderStatus,
} from "./types";

export type ObservabilityEnv = {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  NEXT_PUBLIC_POSTHOG_HOST?: string;
  NEXT_PUBLIC_POSTHOG_TOKEN?: string;
  NEXT_PUBLIC_SENTRY_DSN?: string;
  SENTRY_DSN?: string;
  LANGFUSE_BASE_URL?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
};

const PROVIDER_REQUIREMENTS: Record<ObservabilityProvider, string[]> = {
  sentry: ["NEXT_PUBLIC_SENTRY_DSN"],
  posthog: ["NEXT_PUBLIC_POSTHOG_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST"],
  langfuse: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"],
};

const PHASE_8B_GUARDRAILS: ObservabilityGuardrails = {
  networkTelemetryEnabled: false,
  sessionReplayEnabled: false,
  autocaptureEnabled: false,
  aiContentTracingEnabled: false,
};

function readEnvValue(
  env: ObservabilityEnv,
  key: string,
): string | undefined {
  const value = env[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasAnyProviderSignal(
  provider: ObservabilityProvider,
  env: ObservabilityEnv,
) {
  if (provider === "sentry") {
    return Boolean(
      readEnvValue(env, "NEXT_PUBLIC_SENTRY_DSN") ?? readEnvValue(env, "SENTRY_DSN"),
    );
  }

  return PROVIDER_REQUIREMENTS[provider].some((key) =>
    Boolean(readEnvValue(env, key)),
  );
}

function validateUrlField(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getInvalidKeys(
  provider: ObservabilityProvider,
  env: ObservabilityEnv,
): string[] {
  const invalidKeys: string[] = [];

  if (provider === "sentry") {
    const dsn = readEnvValue(env, "NEXT_PUBLIC_SENTRY_DSN");
    if (dsn && !validateUrlField(dsn)) {
      invalidKeys.push("NEXT_PUBLIC_SENTRY_DSN");
    }

    const serverDsn = readEnvValue(env, "SENTRY_DSN");
    if (serverDsn && !validateUrlField(serverDsn)) {
      invalidKeys.push("SENTRY_DSN");
    }
  }

  if (provider === "posthog") {
    const host = readEnvValue(env, "NEXT_PUBLIC_POSTHOG_HOST");
    if (host && !validateUrlField(host)) {
      invalidKeys.push("NEXT_PUBLIC_POSTHOG_HOST");
    }
  }

  if (provider === "langfuse") {
    const host = readEnvValue(env, "LANGFUSE_BASE_URL");
    if (host && !validateUrlField(host)) {
      invalidKeys.push("LANGFUSE_BASE_URL");
    }
  }

  return invalidKeys;
}

export function getObservabilityProviderStatus(
  provider: ObservabilityProvider,
  env: ObservabilityEnv = process.env,
): ObservabilityProviderStatus {
  const requiredKeys = PROVIDER_REQUIREMENTS[provider];
  const missingKeys = requiredKeys.filter((key) => !readEnvValue(env, key));
  const invalidKeys = getInvalidKeys(provider, env);

  let state: ObservabilityProviderState = "configured";
  if (!hasAnyProviderSignal(provider, env)) {
    state = "disabled";
  } else if (missingKeys.length > 0) {
    state = "missing_config";
  } else if (invalidKeys.length > 0) {
    state = "invalid_config";
  }

  return {
    provider,
    state,
    requiredKeys,
    missingKeys,
    invalidKeys,
    transportMode:
      provider === "sentry" && state === "configured"
        ? "sentry_sdk"
        : provider === "posthog" && state === "configured"
          ? "posthog_js"
          : provider === "langfuse" && state === "configured"
            ? "langfuse_sdk"
          : "noop",
  };
}

export function getObservabilityProviderStatuses(
  env: ObservabilityEnv = process.env,
) {
  return (["sentry", "posthog", "langfuse"] as const).map((provider) =>
    getObservabilityProviderStatus(provider, env),
  );
}

export function getObservabilityHealthSnapshot(
  env: ObservabilityEnv = process.env,
): ObservabilityHealthSnapshot {
  const providers = getObservabilityProviderStatuses(env);

  return {
    providers,
    guardrails: {
      ...PHASE_8B_GUARDRAILS,
      networkTelemetryEnabled: providers.some(
        (provider) => provider.transportMode !== "noop",
      ),
    },
    environmentName: readEnvValue(env, "NODE_ENV") ?? "development",
  };
}
