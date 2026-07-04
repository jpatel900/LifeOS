import {
  getParseCaptureStatus,
  parseCaptureWithFallback,
  type ParseCaptureRuntimeStatus,
} from "@/lib/ai/parseCaptureService";
import { captureError } from "@/lib/observability";

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const [scheme, value] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !value?.trim()) {
    return null;
  }

  return value.trim();
}

function parseRequestBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Parse request body is required.");
  }

  const record = body as Record<string, unknown>;
  if (typeof record.rawText !== "string" || !record.rawText.trim()) {
    throw new Error("rawText is required.");
  }

  if (record.areaContext !== undefined && !Array.isArray(record.areaContext)) {
    throw new Error("areaContext must be an array when provided.");
  }

  let parserMode: "auto" | "mock" = "auto";
  if (record.parserMode !== undefined) {
    if (record.parserMode === "auto" || record.parserMode === "mock") {
      parserMode = record.parserMode;
    } else {
      throw new Error("parserMode must be auto or mock when provided.");
    }
  }

  const areaItems = Array.isArray(record.areaContext)
    ? record.areaContext
    : undefined;
  const areaContext = areaItems?.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as Record<string, unknown>).slug !== "string" ||
      typeof (item as Record<string, unknown>).name !== "string"
    ) {
      throw new Error("areaContext entries require slug and name.");
    }

    const area = item as Record<string, string>;
    return {
      slug: area.slug,
      name: area.name,
    };
  });

  return {
    rawText: record.rawText.trim(),
    areaContext,
    parserMode,
  };
}

function safeParserFailureMessage(status: ParseCaptureRuntimeStatus) {
  if (status === "ai_unavailable") {
    return "AI parser is unavailable right now. You can retry with the mock parser.";
  }

  return "Parsing failed safely. You can retry with the mock parser.";
}

async function logSafeParseFailure(error: unknown) {
  // captureError ships to Sentry/PostHog/Langfuse only when those providers
  // are configured; without them the provider failure (and its discriminating
  // HTTP status, e.g. 429 quota vs 401 key vs 404 model) is invisible in
  // platform logs. Always emit the sanitized message so prod stays diagnosable.
  console.error(
    `parse-capture failed safely: ${error instanceof Error ? error.message : String(error)}`,
  );
  await captureError({
    feature: "parse_capture_route",
    error,
    context: {
      environment: "server",
      error_category: "route_handler_failure",
      route_pattern: "/api/parse-capture",
    },
  });
}

export async function GET() {
  const status = getParseCaptureStatus();

  return Response.json({
    ok: true,
    status: status.status,
    preferredParser: status.preferredParser,
  });
}

export async function POST(request: Request) {
  const status = getParseCaptureStatus();

  try {
    const input = parseRequestBody(await request.json());
    const forceMock =
      input.parserMode === "mock" || status.status === "ai_unavailable";
    const result = await parseCaptureWithFallback(input, {
      forceMock,
      // Optional caller token: used only for fire-and-forget Postgres AI
      // call tracing (issue #288); parsing works without it.
      traceContext: { accessToken: readBearerToken(request) },
    });

    return Response.json({
      ok: true,
      parser: result.parser,
      response: result.response,
      status: status.status,
    });
  } catch (error) {
    await logSafeParseFailure(error);

    return Response.json(
      {
        ok: false,
        error: safeParserFailureMessage(status.status),
        can_retry_with_mock: true,
        status: status.status,
      },
      { status: 502 },
    );
  }
}
