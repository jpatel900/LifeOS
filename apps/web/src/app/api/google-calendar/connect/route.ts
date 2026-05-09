import { NextResponse } from "next/server";
import {
  buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarOAuthState,
  getGoogleCalendarOAuthStateCookieOptions,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  sealGoogleCalendarOAuthStateCookie,
} from "@/lib/googleCalendar/oauth";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
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

function getSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Google Calendar connection could not start.";
}

export async function POST(request: Request) {
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar is not configured on this server. Add server-only Google OAuth env vars before connecting.",
      },
      { status: 503 },
    );
  }

  const accessToken = readBearerToken(request);

  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "Sign in before connecting Google Calendar.",
      },
      { status: 401 },
    );
  }

  try {
    const { user } = await requireSupabaseServerUser(accessToken);
    const state = createGoogleCalendarOAuthState();
    const authorizeUrl = buildGoogleCalendarAuthorizeUrl(state);
    const response = NextResponse.json({
      ok: true,
      authorizeUrl,
    });

    response.cookies.set(
      GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
      sealGoogleCalendarOAuthStateCookie({
        accessToken,
        state,
        userId: user.id,
      }),
      getGoogleCalendarOAuthStateCookieOptions(),
    );

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: getSafeErrorMessage(error),
      },
      { status: 401 },
    );
  }
}
