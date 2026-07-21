import { describe, expect, it } from "vitest";
import { deepLinkTargetForPath } from "./deepLink";

describe("deepLinkTargetForPath", () => {
  it("maps /capture to the capture overlay", () => {
    expect(deepLinkTargetForPath("/capture")).toEqual({ overlay: "capture" });
  });

  it("maps /triage to the triage sheet", () => {
    expect(deepLinkTargetForPath("/triage")).toEqual({ sheet: "triage" });
  });

  it("maps /calendar to the plan sheet", () => {
    expect(deepLinkTargetForPath("/calendar")).toEqual({ sheet: "plan" });
  });

  it("maps /execute to the flow moment", () => {
    expect(deepLinkTargetForPath("/execute")).toEqual({ moment: "flow" });
  });

  it("maps /review to the close moment", () => {
    expect(deepLinkTargetForPath("/review")).toEqual({ moment: "close" });
  });

  it("maps /health to null (full route stays)", () => {
    expect(deepLinkTargetForPath("/health")).toBeNull();
  });

  it("maps /areas to null (full route stays)", () => {
    expect(deepLinkTargetForPath("/areas")).toBeNull();
  });

  it("maps unknown paths to null", () => {
    expect(deepLinkTargetForPath("/unknown")).toBeNull();
    expect(deepLinkTargetForPath("/")).toBeNull();
    expect(deepLinkTargetForPath("")).toBeNull();
  });
});
