import {
  getObservabilityProviderStatus,
  type ObservabilityEnv,
} from "./config";
import type { SanitizedObservabilityValue } from "./types";
import {
  OBSERVABILITY_REDACTED_TEXT,
  sanitizeEventProperties,
  sanitizeObservabilityValue,
} from "./sanitize";

export type SentryRuntime = "client" | "server" | "edge";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readEnvValue(
  env: ObservabilityEnv,
  key: keyof ObservabilityEnv,
): string | undefined {
  const value = env[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getSentryDsn(
  runtime: SentryRuntime,
  env: ObservabilityEnv = process.env,
) {
  if (runtime === "client") {
    return readEnvValue(env, "NEXT_PUBLIC_SENTRY_DSN");
  }

  return (
    readEnvValue(env, "SENTRY_DSN") ??
    readEnvValue(env, "NEXT_PUBLIC_SENTRY_DSN")
  );
}

export function getSentryEnvironment(env: ObservabilityEnv = process.env) {
  return readEnvValue(env, "NODE_ENV") ?? "development";
}

export function getSentryInitConfig(
  runtime: SentryRuntime,
  env: ObservabilityEnv = process.env,
) {
  if (getObservabilityProviderStatus("sentry", env).state !== "configured") {
    return null;
  }

  const dsn = getSentryDsn(runtime, env);
  if (!dsn) {
    return null;
  }

  return {
    dsn,
    enabled: true,
    environment: getSentryEnvironment(env),
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: sanitizeSentryEvent,
  };
}

export function getSentryScopeContext(
  feature: string,
  context: SanitizedObservabilityValue,
) {
  const tags = sanitizeEventProperties({
    feature,
    ...(isRecord(context) ? context : {}),
  });

  return {
    tags,
    extra: isRecord(context) ? context : { context },
  };
}

export function sanitizeSentryEvent(event: unknown) {
  if (!isRecord(event)) {
    return event;
  }

  const sanitized: Record<string, unknown> = { ...event };

  if ("message" in sanitized) {
    sanitized.message = sanitizeObservabilityValue(sanitized.message);
  }

  if ("exception" in sanitized) {
    sanitized.exception = sanitizeObservabilityValue(sanitized.exception);
  }

  if ("contexts" in sanitized) {
    sanitized.contexts = sanitizeObservabilityValue(sanitized.contexts);
  }

  if ("extra" in sanitized) {
    sanitized.extra = sanitizeObservabilityValue(sanitized.extra);
  }

  if ("fingerprint" in sanitized) {
    sanitized.fingerprint = sanitizeObservabilityValue(sanitized.fingerprint);
  }

  if ("tags" in sanitized && isRecord(sanitized.tags)) {
    sanitized.tags = sanitizeEventProperties(sanitized.tags);
  }

  if ("request" in sanitized && isRecord(sanitized.request)) {
    const request = sanitized.request;
    sanitized.request = {
      method: sanitizeObservabilityValue(request.method),
      url: sanitizeObservabilityValue(request.url),
      headers: sanitizeObservabilityValue(request.headers ?? {}),
      data:
        request.data === undefined ? undefined : OBSERVABILITY_REDACTED_TEXT,
      cookies:
        request.cookies === undefined ? undefined : OBSERVABILITY_REDACTED_TEXT,
    };
  }

  if ("user" in sanitized) {
    sanitized.user = undefined;
  }

  if ("breadcrumbs" in sanitized) {
    sanitized.breadcrumbs = undefined;
  }

  return sanitized;
}
