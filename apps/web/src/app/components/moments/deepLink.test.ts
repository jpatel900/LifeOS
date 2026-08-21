import { describe, expect, it } from "vitest";
import { deepLinkTargetFromParams, dropUnknownParams } from "./deepLink";

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

    // C2-S8 (#687 finding 1): `?area=` is deliberately NOT part of this
    // parser's shape — no demoted route ever redirects with an `area`
    // target (unlike moment/sheet/capture/palette, there is no
    // `/main-job` -> `/?area=main-job` shim), so there is nothing for this
    // SERVER-side parser to own for it (the zero-target rule: don't build a
    // field with no caller). `selectedAreaId`'s own URL precedence is
    // resolved separately, in `lib/WorkflowContext.tsx` (see its C2-S8
    // comments) — this test pins that an `area` param is silently ignored
    // HERE rather than accidentally tripping the "unknown value" branch or
    // disturbing the composition of the fields this parser does own.
    it("ignores ?area= (not this parser's param) without disturbing moment/sheet/overlay composition", () => {
      expect(deepLinkTargetFromParams({ area: "area-personal" })).toBeNull();
      expect(
        deepLinkTargetFromParams({
          moment: "flow",
          sheet: "plan",
          capture: "1",
          area: "area-personal",
        }),
      ).toEqual({ moment: "flow", sheet: "plan", overlay: "capture" });
    });
  });
});

// #687 round-6 finding 3: `/?MOMENT=flow` used to end up as
// `/?MOMENT=flow&moment=start&…` — a key the app ignores sitting right next
// to the one it honors. This matrix pins the allowlist scrub: drop anything
// not on the explicit keep-list, including a case-variant near-miss of a
// known key.
describe("dropUnknownParams", () => {
  it("drops a plain unknown key", () => {
    const params = new URLSearchParams("?foo=bar&moment=flow");
    expect(dropUnknownParams(params)).toBe(true);
    expect(params.toString()).toBe("moment=flow");
  });

  it("drops a case-variant near-miss of a known key, keeping the correctly-cased one", () => {
    const params = new URLSearchParams("?MOMENT=flow&moment=start");
    expect(dropUnknownParams(params)).toBe(true);
    expect(params.toString()).toBe("moment=start");
  });

  it("drops case-variants of every known app key", () => {
    const params = new URLSearchParams(
      "?Moment=flow&Sheet=plan&Capture=1&Palette=1&Area=area-personal",
    );
    expect(dropUnknownParams(params)).toBe(true);
    expect(params.toString()).toBe("");
  });

  it("keeps every known app key, exact case, untouched", () => {
    const params = new URLSearchParams(
      "?moment=flow&sheet=plan&capture=1&palette=1&area=area-personal",
    );
    expect(dropUnknownParams(params)).toBe(false);
    expect(params.toString()).toBe(
      "moment=flow&sheet=plan&capture=1&palette=1&area=area-personal",
    );
  });

  it("keeps /login's ?next= return-target param", () => {
    const params = new URLSearchParams("?next=%2Fsettings%2Fareas");
    expect(dropUnknownParams(params)).toBe(false);
    expect(params.get("next")).toBe("/settings/areas");
  });

  it("keeps the Google OAuth callback params (code, state, error, error_description)", () => {
    const params = new URLSearchParams(
      "?code=abc123&state=xyz&error=access_denied&error_description=User+cancelled",
    );
    expect(dropUnknownParams(params)).toBe(false);
    expect(params.get("code")).toBe("abc123");
    expect(params.get("state")).toBe("xyz");
    expect(params.get("error")).toBe("access_denied");
    expect(params.get("error_description")).toBe("User cancelled");
  });

  it("keeps every UTM analytics key", () => {
    const params = new URLSearchParams(
      "?utm_source=x&utm_medium=y&utm_campaign=z&utm_term=t&utm_content=c",
    );
    expect(dropUnknownParams(params)).toBe(false);
    expect(params.toString()).toBe(
      "utm_source=x&utm_medium=y&utm_campaign=z&utm_term=t&utm_content=c",
    );
  });

  it("drops a case-variant of a kept foreign key exactly like a typo (case-sensitive keep-list)", () => {
    const params = new URLSearchParams("?Next=%2Fsettings%2Fareas&moment=flow");
    expect(dropUnknownParams(params)).toBe(true);
    expect(params.toString()).toBe("moment=flow");
  });

  it("does nothing and reports no change when every key is already allowed", () => {
    const params = new URLSearchParams("?moment=flow&next=%2F");
    expect(dropUnknownParams(params)).toBe(false);
    expect(params.toString()).toBe("moment=flow&next=%2F");
  });

  it("handles a mixed matrix — known, foreign-kept, and multiple unknowns together", () => {
    const params = new URLSearchParams(
      "?moment=flow&MOMENT=close&utm_source=email&gclid=123&sheet=plan&next=%2F",
    );
    expect(dropUnknownParams(params)).toBe(true);
    expect(params.toString()).toBe(
      "moment=flow&utm_source=email&sheet=plan&next=%2F",
    );
  });
});
