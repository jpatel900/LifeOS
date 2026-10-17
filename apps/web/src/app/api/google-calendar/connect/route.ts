import { NextResponse } from "next/server";
import {
  buildGoogleCalendarAuthorizeUrl,
  createGoogleCalendarOAuthState,
  getGoogleCalendarOAuthStateCookieOptions,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  sealGoogleCalendarOAuthStateCookie,
} from "@/lib/googleCalendar/oauth";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
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
  if (!getGoogleCalendarConfig()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar is not configured on LifeOS yet, so it can't be connected right now.",
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
    // #670: never echo error.message -- it can carry raw Supabase Auth or
    // config text. Auth rejections get fixed sign-in copy; anything else is
    // logged server-side and answered with a fixed fallback.
    if (isGoogleCalendarRouteAuthFailure(error)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Sign in before connecting Google Calendar.",
        },
        { status: 401 },
      );
    }

    logGoogleCalendarRouteFailure("google-calendar/connect", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          "Google Calendar connection could not start. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
