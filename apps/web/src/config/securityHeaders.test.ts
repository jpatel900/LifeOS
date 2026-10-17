import { describe, expect, it } from "vitest";
import nextConfig, { SECURITY_HEADERS } from "../../next.config";

function headerMap(headers: ReadonlyArray<{ key: string; value: string }>) {
  return Object.fromEntries(headers.map(({ key, value }) => [key, value]));
}

describe("next.config security headers", () => {
  it("applies the security header set to every route", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");
    const rules = await nextConfig.headers!();

    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("/:path*");
    expect(headerMap(rules[0]!.headers)).toEqual(headerMap(SECURITY_HEADERS));
  });

  it("pins the exact baseline header values", () => {
    expect(headerMap(SECURITY_HEADERS)).toEqual({
      "Content-Security-Policy":
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Strict-Transport-Security": "max-age=63072000",
    });
  });

  it("does not advertise the framework via X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
