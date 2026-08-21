import { afterEach, describe, expect, it } from "vitest";
import {
  MOMENTS_PREFS_COOKIE_NAME,
  parseMomentsPrefsCookie,
  readMomentsPrefsCookieClient,
  serializeMomentsPrefsCookie,
  writeMomentsPrefsCookieClient,
} from "./momentsPreferencesCookie";

/**
 * C2-S14 (#687 round-8, defect 1 + defect 3): unit coverage for the shared
 * cookie both defects now depend on. `TodayMoments.persistence.test.tsx`
 * and `areaSelectionSot.test.tsx` cover the two call sites' own behavior;
 * this file covers the module in isolation — parsing, malformed input, and
 * the merge-safe write both call sites rely on to avoid clobbering each
 * other's field.
 */

function clearCookie(): void {
  document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=; Max-Age=0; Path=/`;
}

afterEach(() => {
  clearCookie();
});

describe("parseMomentsPrefsCookie", () => {
  it("parses a well-formed value", () => {
    expect(
      parseMomentsPrefsCookie(
        serializeMomentsPrefsCookie({ moment: "flow", area: "area-personal" }),
      ),
    ).toEqual({ moment: "flow", area: "area-personal" });
  });

  it("keeps area: null (explicit All areas) distinct from area absent", () => {
    expect(
      parseMomentsPrefsCookie(serializeMomentsPrefsCookie({ area: null })),
    ).toEqual({ area: null });
    expect(parseMomentsPrefsCookie(serializeMomentsPrefsCookie({}))).toEqual(
      {},
    );
  });

  it("drops an invalid moment value rather than trusting it", () => {
    expect(
      parseMomentsPrefsCookie(JSON.stringify({ moment: "bogus" })),
    ).toEqual({});
  });

  it("returns null for absent, empty, or malformed raw input", () => {
    expect(parseMomentsPrefsCookie(undefined)).toBeNull();
    expect(parseMomentsPrefsCookie(null)).toBeNull();
    expect(parseMomentsPrefsCookie("")).toBeNull();
    expect(parseMomentsPrefsCookie("{not json")).toBeNull();
    expect(parseMomentsPrefsCookie("[]")).toEqual({});
    expect(parseMomentsPrefsCookie("null")).toBeNull();
  });
});

describe("readMomentsPrefsCookieClient / writeMomentsPrefsCookieClient", () => {
  it("round-trips through document.cookie", () => {
    writeMomentsPrefsCookieClient({ moment: "close", area: "area-personal" });
    expect(readMomentsPrefsCookieClient()).toEqual({
      moment: "close",
      area: "area-personal",
    });
  });

  it("returns null when nothing is set", () => {
    expect(readMomentsPrefsCookieClient()).toBeNull();
  });

  // C2-S14: `moment` (TodayMoments.tsx) and `area` (WorkflowContext.tsx via
  // reducerCore.ts) are two independent writers sharing this one cookie —
  // a plain overwrite would let whichever field wrote LAST erase the
  // other, silently resetting a just-chosen area every time the moment
  // switches (or vice versa). This is the behavior that must not regress.
  it("merges a partial write instead of clobbering the other field", () => {
    writeMomentsPrefsCookieClient({ moment: "start" });
    writeMomentsPrefsCookieClient({ area: "area-personal" });
    expect(readMomentsPrefsCookieClient()).toEqual({
      moment: "start",
      area: "area-personal",
    });

    writeMomentsPrefsCookieClient({ moment: "close" });
    expect(readMomentsPrefsCookieClient()).toEqual({
      moment: "close",
      area: "area-personal",
    });
  });

  it("writing area: null (explicit All areas) is preserved, not treated as absent", () => {
    writeMomentsPrefsCookieClient({ moment: "flow" });
    writeMomentsPrefsCookieClient({ area: null });
    const prefs = readMomentsPrefsCookieClient();
    expect(prefs).toEqual({ moment: "flow", area: null });
    expect(prefs && "area" in prefs).toBe(true);
  });
});
