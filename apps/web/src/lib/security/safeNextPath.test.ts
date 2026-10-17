import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeNextPath";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/settings/areas", "/settings/areas"],
    ["/?moment=plan&area=work", "/?moment=plan&area=work"],
    ["/review#today", "/review#today"],
  ])("keeps same-app path %s", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["empty", ""],
    ["absolute URL", "https://evil.example/"],
    ["protocol-relative", "//evil.example/"],
    ["backslash protocol-relative", "/\\evil.example/"],
    ["double backslash", "\\\\evil.example/"],
    ["tab-smuggled protocol-relative", "/\t/evil.example/"],
    ["newline-smuggled protocol-relative", "/\n/evil.example/"],
    ["javascript scheme", "javascript:alert(1)"],
    ["relative without leading slash", "evil.example"],
  ])("falls back to / for %s", (_label, raw) => {
    expect(safeNextPath(raw as string | null)).toBe("/");
  });
});
