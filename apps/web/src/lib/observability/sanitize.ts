import type {
  ObservabilityPrimitive,
  SanitizedObservabilityValue,
} from "./types";

export const OBSERVABILITY_REDACTED_TEXT = "[REDACTED]";
export const OBSERVABILITY_REDACTED_EMAIL = "[REDACTED_EMAIL]";

export const DANGEROUS_KEY_PATTERNS = [
  /raw[_-]?text/i,
  /raw[_-]?audio/i,
  /prompt/i,
  /completion/i,
  /parsed/i,
  /title/i,
  /description/i,
  /task/i,
  /project/i,
  /calendar/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /authorization/i,
  /cookie/i,
  /email/i,
  /header/i,
  /request[_-]?body/i,
  /body$/i,
];

export const DANGEROUS_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /\b(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+)\b/,
  /\b(?:sk|rk|pk)_[A-Za-z0-9]{8,}\b/i,
  /\b(?:xox[baprs]-[A-Za-z0-9-]+)\b/i,
];

const SAFE_EVENT_PROPERTY_KEYS = new Set([
  "environment",
  "error_category",
  "error_type",
  "feature",
  "model_tier",
  "operation",
  "parse_status",
  "prompt_version",
  "provider",
  "provider_state",
  "route_pattern",
  "schema_version",
  "status",
  "transport_mode",
]);

const SAFE_EVENT_PROPERTY_KEY_PATTERNS = [
  /^has_[a-z0-9_]+$/i,
  /^is_[a-z0-9_]+$/i,
  /^[a-z0-9_]+_bucket$/i,
  /^[a-z0-9_]+_count$/i,
  /^[a-z0-9_]+_flag$/i,
  /^[a-z0-9_]+_state$/i,
  /^[a-z0-9_]+_version$/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDangerousKey(key: string) {
  return DANGEROUS_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function stripUrlQueryString(value: string) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function sanitizeStringValue(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\/\S+/i.test(trimmed)) {
    return stripUrlQueryString(trimmed);
  }

  if (DANGEROUS_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(trimmed)) {
      return OBSERVABILITY_REDACTED_EMAIL;
    }

    return OBSERVABILITY_REDACTED_TEXT;
  }

  return trimmed;
}

function sanitizeError(error: Error) {
  return {
    name: sanitizeStringValue(error.name || "Error"),
    message: sanitizeStringValue(error.message || "Error"),
    stack_present: Boolean(error.stack),
  } satisfies Record<string, SanitizedObservabilityValue>;
}

export function sanitizeObservabilityValue(
  value: unknown,
): SanitizedObservabilityValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return sanitizeStringValue(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : OBSERVABILITY_REDACTED_TEXT;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof URL) {
    return stripUrlQueryString(value.toString());
  }

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObservabilityValue(item));
  }

  if (!isRecord(value)) {
    return OBSERVABILITY_REDACTED_TEXT;
  }

  const result: Record<string, SanitizedObservabilityValue> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isDangerousKey(key)) {
      result[key] = OBSERVABILITY_REDACTED_TEXT;
      continue;
    }

    result[key] = sanitizeObservabilityValue(nestedValue);
  }

  return result;
}

function isSafeEventPropertyKey(key: string) {
  return (
    SAFE_EVENT_PROPERTY_KEYS.has(key) ||
    SAFE_EVENT_PROPERTY_KEY_PATTERNS.some((pattern) => pattern.test(key))
  );
}

function sanitizeEventScalar(
  value: unknown,
): ObservabilityPrimitive | undefined {
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return sanitizeStringValue(value);
}

export function sanitizeEventProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, ObservabilityPrimitive> {
  if (!properties) {
    return {};
  }

  const sanitized: Record<string, ObservabilityPrimitive> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!isSafeEventPropertyKey(key)) {
      continue;
    }

    const sanitizedValue = sanitizeEventScalar(value);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    }
  }

  return sanitized;
}

