import { NextResponse } from "next/server";
import { getGoogleCalendarConfig } from "@/lib/googleCalendar/config";
import {
  exchangeGoogleCalendarCode,
  getGoogleCalendarOAuthStateCookieOptions,
  GOOGLE_CALENDAR_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_ERROR_CODE_MAX_LENGTH,
  GOOGLE_OAUTH_ERROR_DESCRIPTION_MAX_LENGTH,
  isGoogleOAuthProviderError,
  isGoogleCalendarOAuthStateValid,
  readGoogleCalendarOAuthStateCookie,
  truncateGoogleOAuthErrorText,
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

// Sanitized-only inputs to markConnectionError: Google's own error code and
// description (or a local LifeOS code like "missing_code" when Google never
// sent one), never token/secret/authorization-code text.
interface StoredOAuthErrorDetails {
  code: string;
  description: string | null;
  http_status: number | null;
}

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
  lastError: StoredOAuthErrorDetails | null = null,
) {
  try {
    await upsertGoogleCalendarConnectionForAccessToken(accessToken, {
      calendar_id: "primary",
      connected_at: null,
      disconnected_at: new Date().toISOString(),
      granted_scopes_json: scopes,
      last_error_json: lastError
        ? { ...lastError, at: new Date().toISOString() }
        : null,
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
      const providerErrorDescription =
        url.searchParams.get("error_description");
      await markConnectionError(statePayload.accessToken, user.id, [], {
        code: truncateGoogleOAuthErrorText(
          providerError,
          GOOGLE_OAUTH_ERROR_CODE_MAX_LENGTH,
        ),
        description: providerErrorDescription
          ? truncateGoogleOAuthErrorText(
              providerErrorDescription,
              GOOGLE_OAUTH_ERROR_DESCRIPTION_MAX_LENGTH,
            )
          : null,
        http_status: null,
      });
      const response = NextResponse.redirect(
        buildSettingsRedirect(request, "googleCalendarError", "access_denied"),
      );
      clearOAuthCookie(response);
      return response;
    }

    if (!code) {
      await markConnectionError(statePayload.accessToken, user.id, [], {
        code: "missing_code",
        description: null,
        http_status: null,
      });
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
        { code: "refresh_token_missing", description: null, http_status: null },
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
        last_error_json: null,
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
    const errorCode =
      error instanceof Error &&
      /sign in|authenticated user mismatch/i.test(error.message)
        ? "auth_required"
        : "callback_failed";

    // #743 P0: a non-provider crash (e.g. the schema-validation ZodError that
    // caused this incident) used to store `description: null` here, which is
    // exactly what made the incident invisible -- the diagnostics feature
    // could not diagnose its own failure to read the row. Our own thrown
    // Error messages in this codebase are hardcoded, secret-free strings
    // (schema errors, "sign in" guards, Supabase error metadata) -- never
    // token/secret/authorization-code text -- so it's safe to store and log
    // this. Still length-capped as defense in depth.
    //
    // Google's own error, when we have one, is more useful to store and log
    // than the locally-derived redirect bucket above -- it is the actual
    // reason (e.g. "invalid_grant"), not just "auth_required"/"callback_failed".
    // `isGoogleOAuthProviderError` checks a `name` marker rather than class
    // identity, so it still recognizes the error if a bundle split ever gives
    // this route a different copy of the `GoogleOAuthProviderError` class.
    const providerDetails: StoredOAuthErrorDetails = isGoogleOAuthProviderError(
      error,
    )
      ? {
          code: error.code,
          description: error.description,
          http_status: error.httpStatus,
        }
      : {
          code: errorCode,
          description:
            error instanceof Error
              ? truncateGoogleOAuthErrorText(
                  error.message,
                  GOOGLE_OAUTH_ERROR_DESCRIPTION_MAX_LENGTH,
                )
              : null,
          http_status: null,
        };

    await markConnectionError(
      statePayload.accessToken,
      statePayload.userId,
      [],
      providerDetails,
    );

    // #743: this used to log nothing, so a failed connect left no trace in
    // Vercel's runtime logs. No tokens/secrets here -- only Google's own
    // error identifiers plus the user id.
    console.error("[google-calendar/callback] connection attempt failed", {
      code: providerDetails.code,
      description: providerDetails.description,
      httpStatus: providerDetails.http_status,
      userId: statePayload.userId,
    });

    const response = NextResponse.redirect(
      buildSettingsRedirect(request, "googleCalendarError", errorCode),
    );
    clearOAuthCookie(response);
    return response;
  }
}
