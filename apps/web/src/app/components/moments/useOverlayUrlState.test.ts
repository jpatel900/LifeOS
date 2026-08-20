import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseOverlayParam, urlWithOverlay, useOverlayUrlState } from "./useOverlayUrlState";

/**
 * Final UX Loop C2-S7 (#687 finding 2): the useSheetUrlState-shaped hook for
 * a boolean overlay. Mirrors useSheetUrlState.test.ts's own jsdom pattern —
 * jsdom implements pushState/replaceState/location but not real Back/
 * Forward, so popstate assertions rewrite the URL the way a real pop would
 * and dispatch the event by hand.
 */

function goto(url: string) {
  window.history.replaceState(null, "", url);
}

describe("parseOverlayParam", () => {
  it("accepts 1, true and empty-string as open", () => {
    expect(parseOverlayParam("1")).toBe(true);
    expect(parseOverlayParam("true")).toBe(true);
    expect(parseOverlayParam("")).toBe(true);
  });

  it("rejects everything else, including null and garbage values", () => {
    expect(parseOverlayParam(null)).toBe(false);
    expect(parseOverlayParam("0")).toBe(false);
    expect(parseOverlayParam("false")).toBe(false);
    expect(parseOverlayParam("bogus")).toBe(false);
  });
});

describe("urlWithOverlay", () => {
  it("adds the param when opening", () => {
    expect(urlWithOverlay({ pathname: "/", search: "" }, "capture", true)).toBe(
      "/?capture=1",
    );
  });

  it("preserves every other param already on the URL", () => {
    expect(
      urlWithOverlay(
        { pathname: "/", search: "?moment=start" },
        "capture",
        true,
      ),
    ).toBe("/?moment=start&capture=1");
  });

  it("removes only its own param when closing", () => {
    expect(
      urlWithOverlay(
        { pathname: "/", search: "?moment=start&capture=1" },
        "capture",
        false,
      ),
    ).toBe("/?moment=start");
  });
});

describe.each(["capture", "palette"] as const)(
  "useOverlayUrlState(%s)",
  (param) => {
    beforeEach(() => {
      goto("/");
    });

    it("puts the overlay in the URL on open", () => {
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.openOverlay());

      expect(result.current.open).toBe(true);
      expect(window.location.search).toBe(`?${param}=1`);
    });

    it("keeps other params when opening", () => {
      goto("/?moment=start");
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.openOverlay());

      expect(window.location.search).toBe(`?moment=start&${param}=1`);
    });

    it("closing an overlay WE opened steps back rather than growing history", () => {
      const back = vi
        .spyOn(window.history, "back")
        .mockImplementation(() => {});
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.openOverlay());
      act(() => result.current.closeOverlay());

      expect(result.current.open).toBe(false);
      expect(back).toHaveBeenCalledTimes(1);
      back.mockRestore();
    });

    it("closing an overlay adopted from the URL strips the param instead of stealing a Back", () => {
      goto(`/?${param}=1`);
      const back = vi
        .spyOn(window.history, "back")
        .mockImplementation(() => {});
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.adoptOverlayFromUrl(true));
      expect(result.current.open).toBe(true);

      act(() => result.current.closeOverlay());

      expect(result.current.open).toBe(false);
      expect(back).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
      back.mockRestore();
    });

    it("Back closes the overlay (the URL is the authority)", () => {
      const { result } = renderHook(() => useOverlayUrlState(param));
      act(() => result.current.openOverlay());

      act(() => {
        goto("/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(result.current.open).toBe(false);
    });

    it("Forward re-opens the overlay", () => {
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => {
        goto(`/?${param}=1`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });

      expect(result.current.open).toBe(true);
    });

    it("re-opening the overlay already named by the URL does not stack an entry", () => {
      goto(`/?${param}=1`);
      const push = vi.spyOn(window.history, "pushState");
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.openOverlay());

      expect(result.current.open).toBe(true);
      expect(push).not.toHaveBeenCalled();
      push.mockRestore();
    });

    // #687 finding 2's real bug: CommandPalette.tsx calls `onRun` (which can
    // open capture or a sheet — a real, fresh pushState) and THEN `onClose`
    // (this hook's own closeOverlay) in the same handler. A naive
    // "we pushed, so back()" would back() PAST that fresh push, undoing the
    // very navigation the user just took.
    it("closing after something ELSE pushed a newer entry strips the param instead of undoing that push", () => {
      const back = vi
        .spyOn(window.history, "back")
        .mockImplementation(() => {});
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.openOverlay());
      expect(window.location.search).toBe(`?${param}=1`);

      // Someone else pushes a new entry on top (e.g. openSheet("triage") or
      // a sibling openOverlay("capture") call) — the composed URL still
      // carries our stale param, exactly as `urlWithSheet`/`urlWithOverlay`
      // preserve every existing param.
      act(() => {
        window.history.pushState(
          null,
          "",
          `/?${param}=1&sheet=triage`,
        );
      });

      act(() => result.current.closeOverlay());

      expect(result.current.open).toBe(false);
      // Not a back() — that would have landed on the `?param=1` entry below,
      // resurrecting this overlay instead of leaving the newer destination
      // on screen.
      expect(back).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?sheet=triage");
      back.mockRestore();
    });

    it("after a Back, closing never consumes a second Back", () => {
      const back = vi
        .spyOn(window.history, "back")
        .mockImplementation(() => {});
      const { result } = renderHook(() => useOverlayUrlState(param));

      act(() => result.current.openOverlay());
      act(() => {
        goto("/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      act(() => {
        goto(`/?${param}=1`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      back.mockClear();
      act(() => result.current.closeOverlay());

      expect(back).not.toHaveBeenCalled();
      expect(window.location.search).toBe("");
      back.mockRestore();
    });
  },
);
