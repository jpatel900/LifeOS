import { NextResponse } from "next/server";
import { buildUserDataExport } from "@/lib/data/export";
import {
  requireSupabaseServerUser,
  SupabaseAuthRejectedError,
} from "@/lib/supabase/server";

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

  // LOW-1 (#670): missing/invalid/expired token all map to the same generic
  // 401 body — never the raw Supabase Auth error string.
  if (!accessToken) {
    return NextResponse.json(
      { ok: false, errorCategory: "auth_rejected" },
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
        "Content-Disposition": `attachment; filename="lifeos-export-${exportPayload.exported_at.slice(
          0,
          10,
        )}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseAuthRejectedError) {
      return NextResponse.json(
        { ok: false, errorCategory: "auth_rejected" },
        { status: 401 },
      );
    }

    // LOW-1 (#670): log the detail server-side only; the caller gets a
    // generic message, never the raw data-layer/provider error string.
    console.error("export GET failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Data export failed. Nothing was exported; try again.",
      },
      { status: 500 },
    );
  }
}
