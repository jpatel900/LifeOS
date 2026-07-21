import { describe, expect, it } from "vitest";
import { deepLinkTargetForPath, deepLinkTargetFromParams } from "./deepLink";

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

// #687: the redirect shims land on `/` with the target as query params; this
// parses them back into the same DeepLinkTarget shape TodayMoments consumes.
describe("deepLinkTargetFromParams", () => {
  it("maps ?moment=flow to the flow moment", () => {
    expect(deepLinkTargetFromParams({ moment: "flow" })).toEqual({
      moment: "flow",
    });
  });

  it("maps ?moment=close to the close moment", () => {
    expect(deepLinkTargetFromParams({ moment: "close" })).toEqual({
      moment: "close",
    });
  });

  it("maps ?sheet=triage and ?sheet=plan to their sheets", () => {
    expect(deepLinkTargetFromParams({ sheet: "triage" })).toEqual({
      sheet: "triage",
    });
    expect(deepLinkTargetFromParams({ sheet: "plan" })).toEqual({
      sheet: "plan",
    });
  });

  it("maps ?capture and ?palette flags to their overlays", () => {
    expect(deepLinkTargetFromParams({ capture: "1" })).toEqual({
      overlay: "capture",
    });
    expect(deepLinkTargetFromParams({ palette: "true" })).toEqual({
      overlay: "palette",
    });
  });

  it("takes the first value when a param repeats", () => {
    expect(deepLinkTargetFromParams({ sheet: ["triage", "plan"] })).toEqual({
      sheet: "triage",
    });
  });

  it("returns null for no params, unknown values, or undefined", () => {
    expect(deepLinkTargetFromParams({})).toBeNull();
    expect(deepLinkTargetFromParams(undefined)).toBeNull();
    expect(deepLinkTargetFromParams({ sheet: "bogus" })).toBeNull();
    expect(deepLinkTargetFromParams({ moment: "nope" })).toBeNull();
    expect(deepLinkTargetFromParams({ capture: "0" })).toBeNull();
  });

  it("round-trips every redirected path's params to its former target", () => {
    // The stage routes now redirect with these params; the result must match
    // what deepLinkTargetForPath returned for the old path (single source of
    // the moments-surface mapping).
    expect(deepLinkTargetFromParams({ capture: "1" })).toEqual(
      deepLinkTargetForPath("/capture"),
    );
    expect(deepLinkTargetFromParams({ sheet: "triage" })).toEqual(
      deepLinkTargetForPath("/triage"),
    );
    expect(deepLinkTargetFromParams({ sheet: "plan" })).toEqual(
      deepLinkTargetForPath("/calendar"),
    );
    expect(deepLinkTargetFromParams({ moment: "flow" })).toEqual(
      deepLinkTargetForPath("/execute"),
    );
    expect(deepLinkTargetFromParams({ moment: "close" })).toEqual(
      deepLinkTargetForPath("/review"),
    );
  });
});
