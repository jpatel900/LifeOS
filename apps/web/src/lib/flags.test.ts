import { afterEach, describe, expect, it } from "vitest";
import { isMomentsHomeEnabled } from "./flags";

describe("isMomentsHomeEnabled (NEXT_PUBLIC_MOMENTS_HOME)", () => {
  const original = process.env.NEXT_PUBLIC_MOMENTS_HOME;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    } else {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = original;
    }
  });

  it("is off when the flag is unset (default — stage home stays)", () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    expect(isMomentsHomeEnabled()).toBe(false);
  });

  it('is on only for the exact string "true"', () => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "true";
    expect(isMomentsHomeEnabled()).toBe(true);
  });

  it.each(["false", "1", "TRUE", "", "yes"])(
    "is off for any other value (%s)",
    (value) => {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = value;
      expect(isMomentsHomeEnabled()).toBe(false);
    },
  );
});
