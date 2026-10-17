import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time shared-secret comparison (#670 INFO-2).
 *
 * Both sides are hashed to fixed-length SHA-256 digests before
 * `timingSafeEqual`, so the comparison never throws on a length mismatch and
 * its timing leaks neither the secret's content nor its length. Use this for
 * every cron/webhook bearer-secret check instead of `===` / `!==`.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(sha256(provided), sha256(expected));
}
