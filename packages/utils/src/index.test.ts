import { describe, it, expect } from "vitest";
import { clamp } from "./index";

describe("clamp", () => {
  it("clamps value below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps value above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns value within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});
