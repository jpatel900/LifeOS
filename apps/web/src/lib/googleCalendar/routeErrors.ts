/**
 * Shared error classification for the /api/google-calendar/* route handlers
 * (#670 error-message sanitization).
 *
 * Routes must never echo a raw `error.message` to the client: data-layer and
 * provider errors can carry Postgres/PostgREST/Supabase Auth text. Each route
 * returns its own fixed, plain-language copy instead, and only echoes a
 * message for a known user-facing domain error class. The detail goes to
 * the server log via `logGoogleCalendarRouteFailure`.
 *
 * The /api/v1/* and /api/export routes reuse the same two helpers for the
 * same #670 rule (LOW-1), so every bearer-token route classifies an auth
 * rejection and logs an unexpected failure the same way.
 *
 * Classification is by `error.name`, not `instanceof`, for the same reason as
 * `isGoogleOAuthProviderError` in ./oauth: Next.js can bundle more than one
 * copy of a shared module across route chunks, so class identity can differ.
 */

/**
 * True when the caller's sign-in was rejected: either requireSupabaseServerUser
 * threw SupabaseAuthRejectedError, or a later data-layer call was refused
 * because the JWT expired mid-request.
 */
export function isGoogleCalendarRouteAuthFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "SupabaseAuthRejectedError" || /\bjwt\b/i.test(error.message)
  );
}

/** True for a zod schema-parse failure of the request body. */
export function isRequestValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === "ZodError";
}

/** Logs the real failure server-side; the client only sees fixed copy. */
export function logGoogleCalendarRouteFailure(route: string, error: unknown) {
  console.error(`${route} failed:`, error);
}
