import {
  getParseCaptureStatus,
  parseCaptureWithFallback,
  type ParseCaptureRuntimeStatus,
} from "@/lib/ai/parseCaptureService";
import { captureError } from "@/lib/observability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function verifyBearerToken(accessToken: string) {
  const client = createSupabaseServerClient({ accessToken });

  if (!client) {
    return false;
  }

  const { data, error } = await client.auth.getUser();

  return !error && Boolean(data.user);
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

    const area = item as Record<string, unknown>;
    // charterText is optional personalization consumed by the NS-INV-1
    // context-assembly module; a missing/blank charter leaves the prompt
    // byte-identical to baseline (issue #254).
    const charterText =
      typeof area.charterText === "string" ? area.charterText : null;
    return {
      slug: area.slug as string,
      name: area.name as string,
      charterText,
    };
  });

  const operatorProfile = parseOperatorProfile(record.operatorProfile);

  return {
    rawText: record.rawText.trim(),
    areaContext,
    operatorProfile,
    parserMode,
  };
}

function parseOperatorProfile(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object") {
    throw new Error("operatorProfile must be an object when provided.");
  }

  const record = value as Record<string, unknown>;
  const profileText =
    typeof record.profileText === "string" ? record.profileText : null;

  let compensationRules: { trait: string; rule: string }[] | null = null;
  if (record.compensationRules !== undefined) {
    if (!Array.isArray(record.compensationRules)) {
      throw new Error(
        "operatorProfile.compensationRules must be an array when provided.",
      );
    }

    compensationRules = record.compensationRules.map((entry) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof (entry as Record<string, unknown>).trait !== "string" ||
        typeof (entry as Record<string, unknown>).rule !== "string"
      ) {
        throw new Error(
          "operatorProfile.compensationRules entries require trait and rule.",
        );
      }

      const rule = entry as Record<string, string>;
      return { trait: rule.trait, rule: rule.rule };
    });
  }

  return { profileText, compensationRules };
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
  const accessToken = readBearerToken(request);

  if (accessToken && !(await verifyBearerToken(accessToken))) {
    return Response.json(
      { ok: false, errorCategory: "auth_rejected" },
      { status: 401 },
    );
  }

  try {
    const input = parseRequestBody(await request.json());
    const forceMock =
      input.parserMode === "mock" || status.status === "ai_unavailable";
    const result = await parseCaptureWithFallback(input, {
      forceMock,
      // Optional caller token: used only for fire-and-forget Postgres AI
      // call tracing (issue #288); parsing works without it.
      traceContext: { accessToken },
    });

    return Response.json({
      ok: true,
      parser: result.parser,
      response: result.response,
      status: status.status,
      // FR-030: true when this request was auto-degraded to the mock parser
      // after a provider runtime-down response (429/5xx), so the client can
      // show a visible "AI is down, mock used" notice for this response
      // even though status stayed ai_configured (no persistent env change).
      degraded: result.degraded ?? false,
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
