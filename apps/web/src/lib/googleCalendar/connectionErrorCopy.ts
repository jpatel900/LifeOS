/**
 * #743 -- plain-language mapping from a stored `last_error_json` reason to
 * copy a non-technical owner can read at a glance, with the sanitized
 * code/description available for a "details" disclosure underneath.
 *
 * Shared by the connection status route (`api/google-calendar/connection`)
 * and the settings panel (`GoogleCalendarConnectionPanel`) so the two
 * surfaces never drift into two different explanations of the same code.
 * Pure and framework-free so it is safe to import from both a Next.js route
 * handler and a client component.
 *
 * NFR-006: every glance string here is checked by the repo-wide
 * plain-language guard (`__tests__/plainLanguageGuard.test.ts`). Do not add a
 * banned term (see `__tests__/helpers/plainLanguageVocabulary.ts`) to any of
 * these strings without a baseline entry that explains why.
 */

export interface StoredGoogleCalendarConnectionError {
  code: string;
  description: string | null;
}

export interface GoogleCalendarConnectionErrorCopy {
  code: string;
  description: string | null;
  glance: string;
}

// Codes LifeOS knows how to explain in plain words. Keys are Google's own
// OAuth error identifiers (https://www.rfc-editor.org/rfc/rfc6749#section-5.2)
// plus a few LifeOS-local codes used when Google never sent one at all.
const KNOWN_ERROR_GLANCE_MESSAGES: Readonly<Record<string, string>> = {
  invalid_client: "Google didn't accept LifeOS's app credentials.",
  invalid_grant:
    "The sign-in code expired or was already used. Try connecting again.",
  redirect_uri_mismatch:
    "The app's return address doesn't match Google's records.",
  access_denied:
    "You didn't grant Google Calendar access, so nothing was connected.",
  refresh_token_missing:
    "Google didn't give LifeOS lasting permission, so the connection wasn't turned on. Connect again and allow access when Google asks.",
  missing_code:
    "Google didn't send back what LifeOS needed to finish connecting. Please try again.",
  auth_required:
    "You weren't signed in to LifeOS when this finished, so it didn't complete. Sign in and try again.",
  callback_failed:
    "Connecting Google Calendar didn't finish. Nothing was changed. Try connecting again.",
  refresh_failed:
    "LifeOS couldn't refresh your Google Calendar access. Try disconnecting and reconnecting.",
};

function buildUnknownCodeGlance(code: string) {
  return `Google sent back something LifeOS doesn't recognize yet (code: ${code}).`;
}

/**
 * Returns the glance-level plain-language sentence plus the sanitized
 * code/description for a details disclosure, or `null` when there is no
 * stored error to show. Never pass raw provider payload text in here --
 * only the already-sanitized `code`/`description` pair from
 * `last_error_json`.
 */
export function describeGoogleCalendarConnectionError(
  lastError: StoredGoogleCalendarConnectionError | null | undefined,
): GoogleCalendarConnectionErrorCopy | null {
  if (!lastError || !lastError.code) {
    return null;
  }

  const glance =
    KNOWN_ERROR_GLANCE_MESSAGES[lastError.code] ??
    buildUnknownCodeGlance(lastError.code);

  return {
    code: lastError.code,
    description: lastError.description,
    glance,
  };
}
