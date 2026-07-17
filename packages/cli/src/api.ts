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
