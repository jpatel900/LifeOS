import { enhanceRollupProse } from "@/lib/ai/rollupProseService";
import { captureError } from "@/lib/observability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;

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

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * #670: the only error whose message this route returns to the client. Thrown
 * by parseRequestBody for the route's own plain-language validation copy;
 * anything else (e.g. the JSON parser's SyntaxError text) becomes
 * "Invalid request.".
 */
class RollupProseRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RollupProseRequestError";
  }
}

function parseRequestBody(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new RollupProseRequestError("Rollup prose request body is required.");
  }
  const record = body as Record<string, unknown>;

  if (typeof record.areaLabel !== "string" || !record.areaLabel.trim()) {
    throw new RollupProseRequestError("areaLabel is required.");
  }
  if (record.periodType !== "week" && record.periodType !== "month") {
    throw new RollupProseRequestError("periodType must be week or month.");
  }
  if (typeof record.periodLabel !== "string" || !record.periodLabel.trim()) {
    throw new RollupProseRequestError("periodLabel is required.");
  }

  const draft = record.draft;
  if (!draft || typeof draft !== "object") {
    throw new RollupProseRequestError("draft is required.");
  }
  const draftRecord = draft as Record<string, unknown>;
  if (
    !isStringArray(draftRecord.highlights) ||
    !isStringArray(draftRecord.misses)
  ) {
    throw new RollupProseRequestError(
      "draft.highlights and draft.misses must be string arrays.",
    );
  }
  const counts = draftRecord.counts;
  if (
    !counts ||
    typeof counts !== "object" ||
    !Object.values(counts as Record<string, unknown>).every(
      (value) => typeof value === "number",
    )
  ) {
    throw new RollupProseRequestError(
      "draft.counts must be an object of numbers.",
    );
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
  const accessToken = readBearerToken(request);

  // HIGH-1 (#670): this route reached the AI provider on the server key with no
  // auth at all (denial-of-wallet). Require a valid authenticated user before
  // any provider call, mirroring /api/task-map: missing token -> 401, invalid
  // token -> 401. Auth is checked before body parsing so an unauthenticated
  // caller never triggers work.
  if (!accessToken) {
    return Response.json(
      { ok: false, errorCategory: "auth_rejected" },
      { status: 401 },
    );
  }

  if (!(await verifyBearerToken(accessToken))) {
    return Response.json(
      { ok: false, errorCategory: "auth_rejected" },
      { status: 401 },
    );
  }

  let input;
  try {
    input = parseRequestBody(await request.json());
  } catch (error) {
    // Bad input: the client keeps its deterministic draft (it owns the fallback).
    return Response.json(
      {
        ok: false,
        error:
          error instanceof RollupProseRequestError
            ? error.message
            : "Invalid request.",
      },
      { status: 400 },
    );
  }

  try {
    // enhanceRollupProse never throws: it returns the deterministic draft on any
    // AI failure. This try/catch only guards truly unexpected route errors.
    const result = await enhanceRollupProse(input, {
      traceContext: { accessToken },
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
