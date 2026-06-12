import { NextResponse } from "next/server";
import { buildUserDataExport } from "@/lib/data/export";
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

export async function GET(request: Request) {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "Sign in before exporting your data." },
      { status: 401 },
    );
  }

  try {
    // requireSupabaseServerUser returns a user-scoped client (anon key plus
    // the caller's access token), so RLS limits the export to the caller.
    const { client } = await requireSupabaseServerUser(accessToken);
    const exportPayload = await buildUserDataExport(client);

    return NextResponse.json(exportPayload, {
      headers: {
        "Content-Disposition": `attachment; filename="lifeos-export-${
          exportPayload.exported_at.slice(0, 10)
        }.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Data export failed. Nothing was exported; try again.";
    const status = /sign in/i.test(message) ? 401 : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
