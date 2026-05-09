import { NextResponse } from "next/server";
import {
  getGoogleCalendarConnectionForAccessToken,
  upsertGoogleCalendarConnectionForAccessToken,
} from "@/lib/googleCalendar/server";
import { requireSupabaseServerUser } from "@/lib/supabase/server";

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

export async function POST(request: Request) {
  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before disconnecting Google Calendar.",
      },
      { status: 401 },
    );
  }

  try {
    const { user } = await requireSupabaseServerUser(accessToken);
    const { connection } =
      await getGoogleCalendarConnectionForAccessToken(accessToken);

    const updatedConnection = connection
      ? await upsertGoogleCalendarConnectionForAccessToken(accessToken, {
          calendar_id: connection.calendar_id,
          connected_at: connection.connected_at,
          disconnected_at: new Date().toISOString(),
          granted_scopes_json: Array.isArray(connection.granted_scopes_json)
            ? (connection.granted_scopes_json as string[])
            : [],
          status: "disconnected",
          user_id: user.id,
        })
      : null;

    return NextResponse.json({
      ok: true,
      connection: updatedConnection,
      status: "disconnected",
      message:
        "LifeOS cleared local Google Calendar connection metadata. Phase 7C does not persist Google tokens, so revoke access from your Google account separately if needed.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar could not be disconnected.",
      },
      { status: 401 },
    );
  }
}
