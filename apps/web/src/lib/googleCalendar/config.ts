type GoogleCalendarEnv = {
  [key: string]: string | undefined;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY?: string;
};

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
}

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Google Calendar config must stay server-only.");
  }
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getGoogleCalendarConfig(
  env: GoogleCalendarEnv = process.env,
): GoogleCalendarConfig | null {
  assertServerRuntime();

  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI;
  const tokenEncryptionKey = env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (
    !hasText(clientId) ||
    !hasText(clientSecret) ||
    !hasText(redirectUri) ||
    !hasText(tokenEncryptionKey)
  ) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenEncryptionKey,
  };
}

export function isGoogleCalendarConfigured(
  env: GoogleCalendarEnv = process.env,
) {
  return getGoogleCalendarConfig(env) !== null;
}
