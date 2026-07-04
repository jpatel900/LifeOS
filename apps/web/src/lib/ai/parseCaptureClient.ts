import {
  ParseCaptureResponseSchema,
  type ParseCaptureResponse,
} from "@lifeos/schemas";
import type { ParseCaptureRuntimeStatus } from "./parseCaptureService";

/**
 * Browser-safe client for POST /api/parse-capture. Imports only shared schemas
 * plus type-only service contracts; AI env vars and provider code stay server-side.
 */

export type ParseCaptureParserMode = "auto" | "mock";

export interface ParseCaptureAreaContextEntry {
  slug: string;
  name: string;
}

export type ParseCaptureClientStatus = ParseCaptureRuntimeStatus | "unknown";

export type ParseCaptureRequestResult =
  | {
      ok: true;
      parser: "ai" | "mock";
      status: ParseCaptureClientStatus;
      response: ParseCaptureResponse;
    }
  | {
      ok: false;
      status: ParseCaptureClientStatus;
      error: string;
      canRetryWithMock: boolean;
    };

const SAFE_FAILURE_MESSAGE =
  "Parsing is unavailable right now. Your capture is saved; you can retry with the mock parser.";

function toClientStatus(value: unknown): ParseCaptureClientStatus {
  return value === "mock" ||
    value === "ai_configured" ||
    value === "ai_unavailable"
    ? value
    : "unknown";
}

export async function requestParseCapture(input: {
  rawText: string;
  areaContext?: ParseCaptureAreaContextEntry[];
  parserMode: ParseCaptureParserMode;
  // Optional bearer token so the route can write a user-scoped AI call
  // trace row (issue #288); parsing itself never requires it.
  authorization?: string;
  fetchImpl?: typeof fetch;
}): Promise<ParseCaptureRequestResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  let body: Record<string, unknown>;
  let httpOk: boolean;
  try {
    const httpResponse = await fetchImpl("/api/parse-capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.authorization ? { Authorization: input.authorization } : {}),
      },
      body: JSON.stringify({
        rawText: input.rawText,
        areaContext: input.areaContext,
        parserMode: input.parserMode,
      }),
    });
    httpOk = httpResponse.ok;
    body = (await httpResponse.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      status: "unknown",
      error: SAFE_FAILURE_MESSAGE,
      canRetryWithMock: true,
    };
  }

  const status = toClientStatus(body.status);

  if (!httpOk || body.ok !== true) {
    return {
      ok: false,
      status,
      error: typeof body.error === "string" ? body.error : SAFE_FAILURE_MESSAGE,
      canRetryWithMock: body.can_retry_with_mock !== false,
    };
  }

  // Validate before staging anything client-side; never trust transport blindly.
  const parsedResponse = ParseCaptureResponseSchema.safeParse(body.response);
  if (!parsedResponse.success) {
    return {
      ok: false,
      status,
      error: SAFE_FAILURE_MESSAGE,
      canRetryWithMock: true,
    };
  }

  return {
    ok: true,
    parser: body.parser === "ai" ? "ai" : "mock",
    status,
    response: parsedResponse.data,
  };
}
