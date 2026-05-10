import { NextResponse } from "next/server";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarOAuthStateCookieOptions,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  isGoogleCalendarOAuthStateValid,
  readGoogleCalendarOAuthStateCookie,
} from "@/lib/googleCalendar/oauth";
import {
  getGoogleCalendarStoredConnectionForAccessToken,
  upsertGoogleCalendarConnectionForAccessToken,
} from "@/lib/googleCalendar/server";
import { requireSupabaseServerUser } from "@/lib/supabase/server";
import {
  buildGoogleAccessTokenExpiresAt,
  encryptGoogleCalendarToken,
} from "@/lib/googleCalendar/tokens";

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const prefix = `${name}=`;

  for (const part of cookieHeader.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }

  return null;
}

function buildSettingsRedirect(request: Request, key: string, value: string) {
  const url = new URL("/settings/areas", request.url);
  url.searchParams.set(key, value);
  return url;
}

function clearOAuthCookie(response: NextResponse) {
  response.cookies.set(GOOGLE_CALENDAR_OAUTH_STATE_COOKIE, "", {
    ...getGoogleCalendarOAuthStateCookieOptions(),
    maxAge: 0,
  });
}

async function markConnectionError(
  accessToken: string,
  userId: string,
  scopes: string[] = [],
) {
  try {
    await upsertGoogleCalendarConnectionForAccessToken(accessToken, {
      calendar_id: "primary",
      connected_at: null,
      disconnected_at: new Date().toISOString(),
      granted_scopes_json: scopes,
      status: "error",
      user_id: userId,
    });
  } catch {
    // Ignore write failures so the callback can still redirect safely.
  }
}

export async function GET(request: Request) {
  if (!getGoogleCalendarConfig()) {
    const response = NextResponse.redirect(
      buildSettingsRedirect(request, "googleCalendarError", "config_missing"),
    );
    clearOAuthCookie(response);
    return response;
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  const cookieValue = getCookieValue(
    request.headers.get("cookie"),
    GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  );
  const oauthState = readGoogleCalendarOAuthStateCookie(cookieValue);

  if (!oauthState || !isGoogleCalendarOAuthStateValid(oauthState, state)) {
    const response = NextResponse.redirect(
      buildSettingsRedirect(request, "googleCalendarError", "invalid_state"),
    );
    clearOAuthCookie(response);
    return response;
  }

  const statePayload: NonNullable<typeof oauthState> = oauthState;

  try {
    const { user } = await requireSupabaseServerUser(statePayload.accessToken);

    if (user.id !== statePayload.userId) {
      throw new Error("Authenticated user mismatch.");
    }

    if (providerError) {
      await markConnectionError(statePayload.accessToken, user.id);
      const response = NextResponse.redirect(
        buildSettingsRedirect(request, "googleCalendarError", "access_denied"),
      );
      clearOAuthCookie(response);
      return response;
    }

    if (!code) {
      await markConnectionError(statePayload.accessToken, user.id);
      const response = NextResponse.redirect(
        buildSettingsRedirect(request, "googleCalendarError", "missing_code"),
      );
      clearOAuthCookie(response);
      return response;
    }

    const { connection: storedConnection } =
      await getGoogleCalendarStoredConnectionForAccessToken(
        statePayload.accessToken,
      );
    const tokenResponse = await exchangeGoogleCalendarCode({ code });
    const encryptedAccessToken = encryptGoogleCalendarToken(
      tokenResponse.accessToken,
    );
    const encryptedRefreshToken = tokenResponse.refreshToken
      ? encryptGoogleCalendarToken(tokenResponse.refreshToken)
      : (storedConnection?.encrypted_refresh_token ?? null);

    if (!encryptedRefreshToken) {
      await markConnectionError(
        statePayload.accessToken,
        user.id,
        tokenResponse.scope,
      );
      const response = NextResponse.redirect(
        buildSettingsRedirect(
          request,
          "googleCalendarError",
          "refresh_token_missing",
        ),
      );
      clearOAuthCookie(response);
      return response;
    }

    await upsertGoogleCalendarConnectionForAccessToken(
      statePayload.accessToken,
      {
        calendar_id: storedConnection?.calendar_id ?? "primary",
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        granted_scopes_json: tokenResponse.scope,
        status: "connected",
        token_expires_at: buildGoogleAccessTokenExpiresAt(
          tokenResponse.expiresIn,
        ),
        token_type: tokenResponse.tokenType,
        user_id: user.id,
      },
    );

    const response = NextResponse.redirect(
      buildSettingsRedirect(request, "googleCalendar", "connected"),
    );
    clearOAuthCookie(response);
    return response;
  } catch (error) {
    await markConnectionError(statePayload.accessToken, statePayload.userId);

    const errorCode =
      error instanceof Error &&
      /sign in|authenticated user mismatch/i.test(error.message)
        ? "auth_required"
        : "callback_failed";

    const response = NextResponse.redirect(
      buildSettingsRedirect(request, "googleCalendarError", errorCode),
    );
    clearOAuthCookie(response);
    return response;
  }
}
