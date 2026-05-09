import { parseCaptureWithFallback } from "@/lib/ai/parseCaptureService";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to parse capture.";
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

  const areaItems = Array.isArray(record.areaContext) ? record.areaContext : undefined;
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
  };
}

export async function POST(request: Request) {
  try {
    const input = parseRequestBody(await request.json());
    const result = await parseCaptureWithFallback(input);

    return Response.json({
      ok: true,
      parser: result.parser,
      response: result.response,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: `Raw capture was saved, but parsing failed safely: ${errorMessage(error)}`,
      },
      { status: 502 },
    );
  }
}
