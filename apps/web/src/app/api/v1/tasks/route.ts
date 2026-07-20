import { NextResponse } from "next/server";
import { listPlanningItems } from "@/lib/data/workflow";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

/**
 * ADR 0006: versioned read contract for headless clients. Returns the
 * caller's ACTIVE tasks through the same data-layer function the web client
 * uses (`listPlanningItems`), on a user-scoped client — RLS limits the read
 * to the caller; no business rule is reimplemented here.
 */
export async function GET(request: Request) {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sign in before listing tasks." },
      { status: 401 },
    );
  }

  try {
    const { client } = await requireSupabaseServerUser(accessToken);
    const { provider, tasks } = await listPlanningItems(client);

    return NextResponse.json(
      { ok: true, api_version: "1", provider, data: { tasks } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Task list failed.";
    const status = /sign in/i.test(message) ? 401 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
