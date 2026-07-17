import { NextResponse } from "next/server";
import { z } from "zod";
import { CreateCaptureItemInputSchema } from "@lifeos/schemas";
import { syncQueuedCapture } from "@/lib/data/workflow";
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
 * ADR 0006: headless raw-capture contract. `client_capture_id` is REQUIRED
 * (unlike the web overlay) because headless callers retry: persistence goes
 * through `syncQueuedCapture`, the existing idempotent upsert on
 * `(user_id, client_capture_id)` with `ignoreDuplicates` — a replay is a
 * no-op, never a duplicate row.
 */
// The canonical capture input contract (@lifeos/schemas) is the source of
// truth — including its trim semantics, which the web flow already applies.
// The v1 contract narrows it for headless callers: `client_capture_id`
// becomes REQUIRED (retrying agents need idempotency) and `area_id` becomes
// optional for ergonomics (normalized to null before persistence).
const CreateCaptureRequestSchema = CreateCaptureItemInputSchema.extend({
  client_capture_id: z.string().uuid({
    message: "client_capture_id must be a UUID (idempotency key)",
  }),
  area_id: z.string().uuid().nullish(),
});

/**
 * Raw-save-first (binding invariant): this route persists the VERBATIM raw
 * text with status "new" and does nothing else. No parse call, no AI, no
 * draft creation — parsing stays a separate, explicit step (triage or a
 * future explicit CLI parse command), so the raw capture survives any AI
 * failure by construction.
 */
export async function POST(request: Request) {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sign in before saving captures." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = CreateCaptureRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid capture input.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const { client } = await requireSupabaseServerUser(accessToken);
    const { provider } = await syncQueuedCapture(client, {
      raw_text: parsed.data.raw_text,
      area_id: parsed.data.area_id ?? null,
      return_hook: parsed.data.return_hook ?? null,
      client_capture_id: parsed.data.client_capture_id,
    });

    return NextResponse.json(
      {
        ok: true,
        api_version: "1",
        provider,
        data: {
          client_capture_id: parsed.data.client_capture_id,
          status: "persisted",
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Capture save failed.";
    const status = /sign in/i.test(message) ? 401 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
