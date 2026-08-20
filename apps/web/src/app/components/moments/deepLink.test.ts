import { describe, expect, it } from "vitest";
import { deepLinkTargetFromParams } from "./deepLink";

// #687: every demoted route (`/capture`, `/triage`, `/calendar`, `/execute`,
// `/review`, `/health`, `/areas`) now server-redirects straight into `/`
// carrying its target as query params — this is the single inbound parser
// for all of them (C2-S6: `deepLinkTargetForPath` and its path-keyed map were
// dead code, zero callers outside this file, and are gone).
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

  // C2-S3: the Review sheet joined the URL contract. Inbound (here) and
  // outbound (`useSheetUrlState`) now read one shared list, `sheetValues.ts`,
  // so a sheet can never be openable from the rail and unopenable from a
  // refresh — the Target Card 2 failure #804 fixed for the other two.
  it("maps ?sheet=review to the review sheet", () => {
    expect(deepLinkTargetFromParams({ sheet: "review" })).toEqual({
      sheet: "review",
    });
  });

  // C2-S6 (#687): the four legacy shells' sheets join the same contract.
  it("maps ?sheet=health and ?sheet=areas to their sheets", () => {
    expect(deepLinkTargetFromParams({ sheet: "health" })).toEqual({
      sheet: "health",
    });
    expect(deepLinkTargetFromParams({ sheet: "areas" })).toEqual({
      sheet: "areas",
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

  // C2-S6 (#687) FIX: composition, not first-match. `/?moment=flow&sheet=plan`
  // must open Flow WITH the plan sheet open, matching what TodayMoments'
  // deepLink effect already does with each field independently.
  describe("composition — every present field survives together", () => {
    it("moment + sheet both land", () => {
      expect(
        deepLinkTargetFromParams({ moment: "flow", sheet: "plan" }),
      ).toEqual({ moment: "flow", sheet: "plan" });
    });

    it("moment + overlay both land", () => {
      expect(
        deepLinkTargetFromParams({ moment: "close", capture: "1" }),
      ).toEqual({ moment: "close", overlay: "capture" });
    });

    it("sheet + overlay both land", () => {
      expect(
        deepLinkTargetFromParams({ sheet: "review", palette: "1" }),
      ).toEqual({ sheet: "review", overlay: "palette" });
    });

    it("moment + sheet + overlay all land together", () => {
      expect(
        deepLinkTargetFromParams({
          moment: "start",
          sheet: "health",
          capture: "1",
        }),
      ).toEqual({ moment: "start", sheet: "health", overlay: "capture" });
    });

    it("capture takes precedence over palette when both are set", () => {
      expect(deepLinkTargetFromParams({ capture: "1", palette: "1" })).toEqual({
        overlay: "capture",
      });
    });
  });
});
