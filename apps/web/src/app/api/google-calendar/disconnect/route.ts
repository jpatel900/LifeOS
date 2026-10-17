import { NextResponse } from "next/server";
import {
  getGoogleCalendarStoredConnectionForAccessToken,
  upsertGoogleCalendarConnectionForAccessToken,
} from "@/lib/googleCalendar/server";
import {
  isGoogleCalendarRouteAuthFailure,
  logGoogleCalendarRouteFailure,
} from "@/lib/googleCalendar/routeErrors";
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
      await getGoogleCalendarStoredConnectionForAccessToken(accessToken);

    const updatedConnection = connection
      ? await upsertGoogleCalendarConnectionForAccessToken(accessToken, {
          calendar_id: connection.calendar_id,
          connected_at: connection.connected_at,
          disconnected_at: new Date().toISOString(),
          encrypted_access_token: null,
          encrypted_refresh_token: null,
          granted_scopes_json: Array.isArray(connection.granted_scopes_json)
            ? (connection.granted_scopes_json as string[])
            : [],
          status: "disconnected",
          token_expires_at: null,
          token_type: null,
          user_id: user.id,
        })
      : null;

    return NextResponse.json({
      ok: true,
      connection: updatedConnection,
      status: "disconnected",
      message:
        "LifeOS disconnected Google Calendar and deleted its saved access on our side. Your permission still lives in your Google account — remove it there too if you want to fully revoke access.",
    });
  } catch (error) {
    // #670: only an auth rejection is a 401, with fixed sign-in copy. Any
    // other failure is logged server-side and answered with a fixed 500 --
    // never the raw error text.
    if (isGoogleCalendarRouteAuthFailure(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sign in before disconnecting Google Calendar.",
        },
        { status: 401 },
      );
    }

    logGoogleCalendarRouteFailure("google-calendar/disconnect", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar could not be disconnected. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
