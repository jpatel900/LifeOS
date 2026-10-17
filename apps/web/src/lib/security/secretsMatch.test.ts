import { describe, expect, it } from "vitest";
import { secretsMatch } from "./secretsMatch";

describe("secretsMatch", () => {
  it("returns true for identical secrets", () => {
    expect(secretsMatch("cron-secret", "cron-secret")).toBe(true);
  });

  it.each([
    ["a different secret of equal length", "cron-secreX"],
    ["a strict prefix", "cron-secre"],
    ["a trailing suffix", "cron-secret-extra"],
    ["the secret plus a NUL that matches the padding", "cron-secret\u0000"],
    ["an empty string", ""],
    ["a much longer value", "x".repeat(4096)],
  ])("returns false (never throws) for %s", (_label, provided) => {
    expect(() => secretsMatch(provided, "cron-secret")).not.toThrow();
    expect(secretsMatch(provided, "cron-secret")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(secretsMatch("CRON-SECRET", "cron-secret")).toBe(false);
  });
});
