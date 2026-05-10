import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { getGoogleCalendarConfig } from "./config";

const TOKEN_ENVELOPE_VERSION = "v1";

function assertServerRuntime() {
  const isTestRuntime =
    process.env.VITEST === "true" || process.env.NODE_ENV === "test";

  if (typeof window !== "undefined" && !isTestRuntime) {
    throw new Error("Google Calendar token helpers must stay server-only.");
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

function requireGoogleCalendarConfig() {
  const config = getGoogleCalendarConfig();

  if (!config) {
    throw new Error(
      "Google Calendar is not configured for secure token storage.",
    );
  }

  return config;
}

function normalizeIssuedAt(issuedAt: string | number | Date) {
  if (typeof issuedAt === "string") {
    return new Date(issuedAt);
  }

  if (issuedAt instanceof Date) {
    return new Date(issuedAt.getTime());
  }

  return new Date(issuedAt);
}

export function encryptGoogleCalendarToken(token: string) {
  assertServerRuntime();

  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Google Calendar token encryption requires token text.");
  }

  const config = requireGoogleCalendarConfig();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(config.tokenEncryptionKey),
    iv,
  );
  const plaintext = Buffer.from(token, "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    TOKEN_ENVELOPE_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(ciphertext),
    encodeBase64Url(tag),
  ].join(".");
}

export function decryptGoogleCalendarToken(encryptedToken: string) {
  assertServerRuntime();

  if (
    typeof encryptedToken !== "string" ||
    encryptedToken.trim().length === 0
  ) {
    throw new Error("Google Calendar token decryption requires ciphertext.");
  }

  const [version, encodedIv, encodedCiphertext, encodedTag] =
    encryptedToken.split(".");

  if (
    version !== TOKEN_ENVELOPE_VERSION ||
    !encodedIv ||
    !encodedCiphertext ||
    !encodedTag
  ) {
    throw new Error("Google Calendar token ciphertext is invalid.");
  }

  const config = requireGoogleCalendarConfig();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(config.tokenEncryptionKey),
    decodeBase64Url(encodedIv),
  );
  decipher.setAuthTag(decodeBase64Url(encodedTag));

  return Buffer.concat([
    decipher.update(decodeBase64Url(encodedCiphertext)),
    decipher.final(),
  ]).toString("utf8");
}

export function buildGoogleAccessTokenExpiresAt(
  expiresInSeconds: number,
  issuedAt: string | number | Date = Date.now(),
) {
  assertServerRuntime();

  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("Google Calendar token expiry must be a positive number.");
  }

  const issuedAtDate = normalizeIssuedAt(issuedAt);

  if (Number.isNaN(issuedAtDate.getTime())) {
    throw new Error("Google Calendar token issue time is invalid.");
  }

  return new Date(
    issuedAtDate.getTime() + expiresInSeconds * 1000,
  ).toISOString();
}
