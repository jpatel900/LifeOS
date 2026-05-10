import {
  getParseCaptureStatus,
  parseCaptureWithFallback,
  type ParseCaptureRuntimeStatus,
} from "@/lib/ai/parseCaptureService";

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

function logSafeParseFailure(error: unknown) {
  const errorType =
    error instanceof Error && error.name ? error.name : "UnknownError";
  console.error("parse-capture route failed safely", { errorType });
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
    const result = await parseCaptureWithFallback(input, { forceMock });

    return Response.json({
      ok: true,
      parser: result.parser,
      response: result.response,
      status: status.status,
    });
  } catch (error) {
    logSafeParseFailure(error);

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
