const PLACEHOLDER_ORIGIN = "http://same-app.invalid";

/**
 * Sanitize a post-login `?next=` value to a same-app path, else `/`.
 *
 * A bare `startsWith("/") && !startsWith("//")` check is not enough: the
 * WHATWG URL parser (which `router.push` uses) treats `\` as `/` and strips
 * tab/newline characters, so `/\evil.example` or `/\t/evil.example` resolve
 * to `//evil.example` — an open redirect off-origin after sign-in. Reject
 * backslashes and control characters outright, then confirm the value
 * resolves to the same origin.
 */
export function safeNextPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return "/";

  try {
    const resolved = new URL(raw, PLACEHOLDER_ORIGIN);
    if (resolved.origin !== PLACEHOLDER_ORIGIN) return "/";
  } catch {
    return "/";
  }

  return raw;
}
