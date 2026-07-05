import { describe, expect, it } from "vitest";
import {
  HIT_TARGET_INVISIBLE,
  HIT_TARGET_MIN,
  HIT_TARGET_ROW,
} from "./hitTarget";

/**
 * SP-9: every shared hit-target utility set must guarantee the >=44px
 * effective hit area (min-h/min-w) and kill the 300ms double-tap delay
 * (touch-manipulation) on coarse pointers. This is the packet's oracle:
 * a unit test asserting the shared button/row class set includes the
 * hit-area + touch-manipulation utilities. Visual verification (that
 * backgrounded elements which grow are acceptable) is deferred to the
 * owner per the PR body.
 */
describe("hitTarget shared utility sets", () => {
  it("HIT_TARGET_MIN includes the 44px floor on both axes and touch-manipulation", () => {
    expect(HIT_TARGET_MIN).toContain("min-h-[44px]");
    expect(HIT_TARGET_MIN).toContain("min-w-[44px]");
    expect(HIT_TARGET_MIN).toContain("touch-manipulation");
  });

  it("HIT_TARGET_ROW includes the 44px height floor and touch-manipulation without forcing display/centering", () => {
    expect(HIT_TARGET_ROW).toContain("min-h-[44px]");
    expect(HIT_TARGET_ROW).toContain("touch-manipulation");
    expect(HIT_TARGET_ROW).not.toContain("inline-flex");
    expect(HIT_TARGET_ROW).not.toContain("justify-center");
  });

  it("HIT_TARGET_INVISIBLE includes the 44px floor on both axes, touch-manipulation, and a compensating negative margin", () => {
    expect(HIT_TARGET_INVISIBLE).toContain("min-h-[44px]");
    expect(HIT_TARGET_INVISIBLE).toContain("min-w-[44px]");
    expect(HIT_TARGET_INVISIBLE).toContain("touch-manipulation");
    expect(HIT_TARGET_INVISIBLE).toContain("-m-2.5");
  });
});
