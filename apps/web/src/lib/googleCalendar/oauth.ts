import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getGoogleCalendarConfig } from "./config";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events.owned",
] as const;

export const GOOGLE_CALENDAR_OAUTH_STATE_COOKIE =
  "lifeos_google_calendar_oauth";

const GOOGLE_STATE_MAX_AGE_SECONDS = 10 * 60;
const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleOAuthStatePayload {
  state: string;
  userId: string;
  accessToken: string;
  createdAt: string;
}

interface ExchangeGoogleCodeParams {
  code: string;
}

export interface GoogleOAuthTokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string[];
  tokenType: string;
}

interface RefreshGoogleAccessTokenParams {
  refreshToken: string;
}

export interface GoogleRefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string[] | null;
  tokenType: string;
}

export type GoogleOAuthErrorPhase = "exchange" | "refresh";

export interface GoogleOAuthProviderErrorInit {
  code: string;
  description: string | null;
  httpStatus: number;
  phase: GoogleOAuthErrorPhase;
}

/**
 * Carries Google's own OAuth error identifier and description (the
 * `error`/`error_description` fields Google's token endpoint returns) so a
 * caller can log and persist the real reason a connect/refresh failed,
 * instead of a bare "failed" message. This must NEVER be constructed with
 * token, client-secret, or authorization-code text — only Google's error
 * code/description and the HTTP status.
 */
export class GoogleOAuthProviderError extends Error {
  readonly code: string;
  readonly description: string | null;
  readonly httpStatus: number;
  readonly phase: GoogleOAuthErrorPhase;

  constructor(init: GoogleOAuthProviderErrorInit) {
    super("Google Calendar connection step did not complete.");
    this.name = "GoogleOAuthProviderError";
    this.code = init.code;
    this.description = init.description;
    this.httpStatus = init.httpStatus;
    this.phase = init.phase;
  }
}

/**
 * #743 P0 follow-up: prefer this over `error instanceof GoogleOAuthProviderError`.
 * `instanceof` compares against the exact class identity from THIS module
 * instance, which can silently fail across a bundle/chunk split (Next.js can
 * emit more than one copy of a shared module across route bundles) -- the
 * error would still carry the right shape, but the check would say no and
 * fall through to a generic, undiagnosed error path. This checks the
 * `name` marker set in the constructor plus the expected fields instead of
 * relying on class identity.
 */
export function isGoogleOAuthProviderError(
  error: unknown,
): error is GoogleOAuthProviderError {
  return (
    error instanceof Error &&
    error.name === "GoogleOAuthProviderError" &&
    typeof (error as GoogleOAuthProviderError).code === "string" &&
    typeof (error as GoogleOAuthProviderError).httpStatus === "number"
  );
}

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Google Calendar OAuth helpers must stay server-only.");
  }
}

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

function encodeBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// #743: Google's error/error_description are external, unvalidated text that
// ends up persisted and eventually rendered. Cap their length before they
// travel any further so a pathological response can't bloat storage or the
// response payload.
export const GOOGLE_OAUTH_ERROR_CODE_MAX_LENGTH = 100;
export const GOOGLE_OAUTH_ERROR_DESCRIPTION_MAX_LENGTH = 500;

export function truncateGoogleOAuthErrorText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function parseStatePayload(value: unknown): GoogleOAuthStatePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    !isNonEmptyString(record.state) ||
    !isNonEmptyString(record.userId) ||
    !isNonEmptyString(record.accessToken) ||
    !isNonEmptyString(record.createdAt)
  ) {
    return null;
  }

  const createdAt = new Date(record.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return {
    state: record.state,
    userId: record.userId,
    accessToken: record.accessToken,
    createdAt: createdAt.toISOString(),
  };
}

function splitScopes(scopeValue: string | null | undefined) {
  if (!isNonEmptyString(scopeValue)) {
    return [...GOOGLE_CALENDAR_SCOPES];
  }

  return Array.from(
    new Set(
      scopeValue
        .split(/\s+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ).sort();
}

export function buildGoogleCalendarAuthorizeUrl(state: string) {
  assertServerRuntime();

  const config = getGoogleCalendarConfig();

  if (!config) {
    throw new Error("Google Calendar is not configured.");
  }

  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");

  return url.toString();
}

export function createGoogleCalendarOAuthState() {
  assertServerRuntime();
  return randomBytes(32).toString("hex");
}

export function sealGoogleCalendarOAuthStateCookie(payload: {
  accessToken: string;
  state: string;
  userId: string;
}) {
  assertServerRuntime();

  const config = getGoogleCalendarConfig();

  if (!config) {
    throw new Error("Google Calendar is not configured.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(config.clientSecret),
    iv,
  );
  const plaintext = Buffer.from(
    JSON.stringify({
      accessToken: payload.accessToken,
      state: payload.state,
      userId: payload.userId,
      createdAt: new Date().toISOString(),
    } satisfies GoogleOAuthStatePayload),
    "utf8",
  );
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, ciphertext, tag].map(encodeBase64Url).join(".");
}

export function readGoogleCalendarOAuthStateCookie(cookieValue: string | null) {
  assertServerRuntime();

  if (!isNonEmptyString(cookieValue)) {
    return null;
  }

  const config = getGoogleCalendarConfig();

  if (!config) {
    return null;
  }

  const [encodedIv, encodedCiphertext, encodedTag] = cookieValue.split(".");

  if (!encodedIv || !encodedCiphertext || !encodedTag) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(config.clientSecret),
      decodeBase64Url(encodedIv),
    );
    decipher.setAuthTag(decodeBase64Url(encodedTag));
    const plaintext = Buffer.concat([
      decipher.update(decodeBase64Url(encodedCiphertext)),
      decipher.final(),
    ]).toString("utf8");

    return parseStatePayload(JSON.parse(plaintext));
  } catch {
    return null;
  }
}

export function isGoogleCalendarOAuthStateValid(
  payload: GoogleOAuthStatePayload | null,
  expectedState: string | null,
) {
  if (
    !payload ||
    !isNonEmptyString(expectedState) ||
    payload.state !== expectedState
  ) {
    return false;
  }

  const createdAt = new Date(payload.createdAt).getTime();
  const expiresAt = createdAt + GOOGLE_STATE_MAX_AGE_SECONDS * 1000;

  return Date.now() <= expiresAt;
}

export function getGoogleCalendarOAuthStateCookieOptions() {
  assertServerRuntime();

  const config = getGoogleCalendarConfig();
  const isSecure =
    process.env.NODE_ENV === "production" ||
    (config?.redirectUri?.startsWith("https://") ?? false);

  return {
    httpOnly: true,
    maxAge: GOOGLE_STATE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
  };
}

function buildProviderErrorInit(
  payload: Record<string, unknown> | null,
  response: Response,
  phase: GoogleOAuthErrorPhase,
): GoogleOAuthProviderErrorInit {
  return {
    phase,
    code: isNonEmptyString(payload?.error)
      ? truncateGoogleOAuthErrorText(
          payload.error,
          GOOGLE_OAUTH_ERROR_CODE_MAX_LENGTH,
        )
      : "unknown_error",
    description: isNonEmptyString(payload?.error_description)
      ? truncateGoogleOAuthErrorText(
          payload.error_description,
          GOOGLE_OAUTH_ERROR_DESCRIPTION_MAX_LENGTH,
        )
      : null,
    httpStatus: response.status,
  };
}

export async function exchangeGoogleCalendarCode(
  params: ExchangeGoogleCodeParams,
): Promise<GoogleOAuthTokenResponse> {
  assertServerRuntime();

  const config = getGoogleCalendarConfig();

  if (!config) {
    throw new Error("Google Calendar is not configured.");
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: params.code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new GoogleOAuthProviderError(
      buildProviderErrorInit(payload, response, "exchange"),
    );
  }

  if (
    !payload ||
    !isNonEmptyString(payload.access_token) ||
    typeof payload.expires_in !== "number" ||
    !isNonEmptyString(payload.token_type)
  ) {
    throw new Error("Google token exchange returned an invalid payload.");
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    refreshToken: isNonEmptyString(payload.refresh_token)
      ? payload.refresh_token
      : null,
    scope: splitScopes(
      typeof payload.scope === "string" ? payload.scope : undefined,
    ),
    tokenType: payload.token_type,
  };
}

export async function refreshGoogleCalendarAccessToken(
  params: RefreshGoogleAccessTokenParams,
): Promise<GoogleRefreshTokenResponse> {
  assertServerRuntime();

  if (!isNonEmptyString(params.refreshToken)) {
    throw new Error("Google Calendar refresh token is required.");
  }

  const config = getGoogleCalendarConfig();

  if (!config) {
    throw new Error("Google Calendar is not configured.");
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!response.ok) {
    throw new GoogleOAuthProviderError(
      buildProviderErrorInit(payload, response, "refresh"),
    );
  }

  if (
    !payload ||
    !isNonEmptyString(payload.access_token) ||
    typeof payload.expires_in !== "number" ||
    !isNonEmptyString(payload.token_type)
  ) {
    throw new Error("Google access token refresh returned an invalid payload.");
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    refreshToken: isNonEmptyString(payload.refresh_token)
      ? payload.refresh_token
      : null,
    scope:
      typeof payload.scope === "string" ? splitScopes(payload.scope) : null,
    tokenType: payload.token_type,
  };
}
