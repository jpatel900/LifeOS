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

  it("is on when the flag is unset (P7d go-live default — moments home)", () => {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
    expect(isMomentsHomeEnabled()).toBe(true);
  });

  it('is off only for the exact string "false" (the revert switch)', () => {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
    expect(isMomentsHomeEnabled()).toBe(false);
  });

  it.each(["true", "1", "TRUE", "", "yes"])(
    "stays on for any non-false value (%s)",
    (value) => {
      process.env.NEXT_PUBLIC_MOMENTS_HOME = value;
      expect(isMomentsHomeEnabled()).toBe(true);
    },
  );
});
