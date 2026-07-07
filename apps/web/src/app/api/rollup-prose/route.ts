import { enhanceRollupProse } from "@/lib/ai/rollupProseService";
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseRequestBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("Rollup prose request body is required.");
  }
  const record = body as Record<string, unknown>;

  if (typeof record.areaLabel !== "string" || !record.areaLabel.trim()) {
    throw new Error("areaLabel is required.");
  }
  if (record.periodType !== "week" && record.periodType !== "month") {
    throw new Error("periodType must be week or month.");
  }
  if (typeof record.periodLabel !== "string" || !record.periodLabel.trim()) {
    throw new Error("periodLabel is required.");
  }

  const draft = record.draft;
  if (!draft || typeof draft !== "object") {
    throw new Error("draft is required.");
  }
  const draftRecord = draft as Record<string, unknown>;
  if (
    !isStringArray(draftRecord.highlights) ||
    !isStringArray(draftRecord.misses)
  ) {
    throw new Error("draft.highlights and draft.misses must be string arrays.");
  }
  const counts = draftRecord.counts;
  if (
    !counts ||
    typeof counts !== "object" ||
    !Object.values(counts as Record<string, unknown>).every(
      (value) => typeof value === "number",
    )
  ) {
    throw new Error("draft.counts must be an object of numbers.");
  }

  return {
    areaLabel: record.areaLabel.trim(),
    periodType: record.periodType as "week" | "month",
    periodLabel: record.periodLabel.trim(),
    draft: {
      highlights: draftRecord.highlights,
      misses: draftRecord.misses,
      counts: counts as Record<string, number>,
    },
  };
}

export async function POST(request: Request) {
  let input;
  try {
    input = parseRequestBody(await request.json());
  } catch (error) {
    // Bad input: the client keeps its deterministic draft (it owns the fallback).
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid request.",
      },
      { status: 400 },
    );
  }

  try {
    // enhanceRollupProse never throws: it returns the deterministic draft on any
    // AI failure. This try/catch only guards truly unexpected route errors.
    const result = await enhanceRollupProse(input, {
      traceContext: { accessToken: readBearerToken(request) },
    });
    return Response.json({
      ok: true,
      source: result.source,
      summary: result.summary,
      degraded: result.degraded ?? false,
    });
  } catch (error) {
    console.error(
      `rollup-prose failed safely: ${error instanceof Error ? error.message : String(error)}`,
    );
    await captureError({
      feature: "rollup_prose_route",
      error,
      context: {
        environment: "server",
        error_category: "route_handler_failure",
        route_pattern: "/api/rollup-prose",
      },
    });
    // Echo the deterministic draft so the client always has a usable summary.
    return Response.json({
      ok: true,
      source: "deterministic",
      summary: input.draft,
      degraded: true,
    });
  }
}
