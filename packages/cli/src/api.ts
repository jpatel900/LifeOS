import type { CliConfig } from "./config";

/**
 * ADR 0006: every data operation goes through the versioned server
 * contracts with a user-scoped bearer token. No Supabase table access, no
 * business logic — this module is transport only.
 */

export interface ApiResult {
  status: number;
  body: unknown;
}

async function request(
  config: CliConfig,
  method: "GET" | "POST",
  apiPath: string,
  options: { accessToken?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${config.apiUrl}${apiPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = { ok: false, error: `Non-JSON response (HTTP ${response.status})` };
  }

  return { status: response.status, body };
}

export function getCapabilities(config: CliConfig) {
  return request(config, "GET", "/api/v1/capabilities");
}

export function listTasks(config: CliConfig, accessToken: string) {
  return request(config, "GET", "/api/v1/tasks", { accessToken });
}

export function listAreas(
  config: CliConfig,
  accessToken: string,
  options: { includeInactive?: boolean } = {},
) {
  const query = options.includeInactive ? "?include_inactive=1" : "";
  return request(config, "GET", `/api/v1/areas${query}`, { accessToken });
}

export function listBlocks(
  config: CliConfig,
  accessToken: string,
  window: { start: string; end: string },
) {
  const query = new URLSearchParams(window).toString();
  return request(config, "GET", `/api/v1/blocks?${query}`, { accessToken });
}

/**
 * /api/parse-capture is OUTSIDE the /api/v1 surface: it is the existing
 * stateless parse service the web capture overlay uses. It persists nothing;
 * the bearer token is attached only for AI-call tracing (#288). Area
 * slug/name context improves area matching; charter personalization is a
 * web-only concern and is deliberately not passed here (#641).
 */
export function parseCapture(
  config: CliConfig,
  accessToken: string,
  input: {
    rawText: string;
    parserMode?: "auto" | "mock";
    areaContext?: ReadonlyArray<{ slug: string; name: string }>;
  },
) {
  return request(config, "POST", "/api/parse-capture", {
    accessToken,
    body: {
      rawText: input.rawText,
      ...(input.parserMode ? { parserMode: input.parserMode } : {}),
      ...(input.areaContext ? { areaContext: input.areaContext } : {}),
    },
  });
}

export function createCapture(
  config: CliConfig,
  accessToken: string,
  input: {
    raw_text: string;
    return_hook?: string | null;
    area_id?: string | null;
    client_capture_id: string;
  },
) {
  return request(config, "POST", "/api/v1/captures", {
    accessToken,
    body: input,
  });
}
