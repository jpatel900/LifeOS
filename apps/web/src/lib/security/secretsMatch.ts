import { timingSafeEqual } from "node:crypto";

function padTo(value: Buffer, length: number) {
  const padded = Buffer.alloc(length);
  value.copy(padded);
  return padded;
}

/**
 * Constant-time shared-secret comparison (#670 INFO-2).
 *
 * Both sides are zero-padded to the same length before `timingSafeEqual`, so
 * the comparison never throws on a length mismatch and its timing does not
 * leak the secret's content. The length check runs after the constant-time
 * compare, so padding can never turn a mismatch into a match. No hashing:
 * nothing here is stored, and hashing a secret trips CodeQL's password-hash
 * query. Use this for every cron/webhook bearer-secret check instead of
 * `===` / `!==`.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  const length = Math.max(a.length, b.length);
  const contentMatches = timingSafeEqual(padTo(a, length), padTo(b, length));
  return contentMatches && a.length === b.length;
}
