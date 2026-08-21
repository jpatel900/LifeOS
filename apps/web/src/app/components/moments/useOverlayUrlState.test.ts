import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseOverlayParam,
  urlWithOverlay,
  useOverlayUrlState,
} from "./useOverlayUrlState";

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
        window.history.pushState(null, "", `/?${param}=1&sheet=triage`);
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

/**
 * C2-S11 (#687 round-5 judge, C2 blocker — "one Back press does nothing",
 * battery4 A2 back1/back2). The two tests above cover a SINGLE hook
 * instance's reaction to something else pushing on top of it; the actual
 * reported defect only appears with TWO mounted instances (capture's,
 * palette's) — `popstate` is a window event, so capture's own close-via-
 * `back()` also fires PALETTE's listener, even though palette had nothing
 * to do with that particular pop. Pre-fix, palette's listener unconditionally
 * forgot it owned its entry every time ANY popstate fired, so when palette
 * was closed next it wrongly believed something else must still be on top
 * and only stripped its param via `replaceState` — turning its own entry
 * into a byte-for-byte duplicate of the one behind it instead of calling
 * `back()`. One `Back` would land on that duplicate (nothing visibly
 * changed); a second was needed to reach a genuinely different entry.
 *
 * Cannot be exercised by simply mocking `history.back()` as a no-op (the
 * other tests' pattern) — the bug is specifically about what `back()`
 * ACTUALLY does to the position, so this test's mock performs the real
 * effect (restore the entry immediately behind, fire popstate) the way jsdom
 * would if it implemented traversal (file header: it does not).
 */
describe("useOverlayUrlState — composed nesting (capture opened from palette, two live instances)", () => {
  beforeEach(() => {
    goto("/");
  });

  it("after Esc closes the inner overlay and Esc closes the outer one, the outer close still consumes its own Back", () => {
    // A minimal REAL history stack, driven by the actual pushState/
    // replaceState calls the app code makes (jsdom applies them for real —
    // only `back()`/`forward()` traversal is unimplemented, per the file
    // header) — so `back()`'s mock pops whatever is ACTUALLY behind the
    // current position, exactly like a real browser, rather than restoring
    // a hardcoded snapshot (which cannot be right for more than one pop).
    const stack: Array<{ state: unknown; url: string }> = [
      {
        state: window.history.state,
        url: `${window.location.pathname}${window.location.search}`,
      },
    ];
    let position = 0;
    const realPushState = window.history.pushState.bind(window.history);
    const realReplaceState = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, "pushState").mockImplementation(
      (state, title, url) => {
        realPushState(state, title, url ?? undefined);
        stack.length = position + 1;
        stack.push({
          state: window.history.state,
          url: `${window.location.pathname}${window.location.search}`,
        });
        position++;
      },
    );
    vi.spyOn(window.history, "replaceState").mockImplementation(
      (state, title, url) => {
        realReplaceState(state, title, url ?? undefined);
        stack[position] = {
          state: window.history.state,
          url: `${window.location.pathname}${window.location.search}`,
        };
      },
    );
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {
      position--;
      const entry = stack[position];
      realReplaceState(entry.state, "", entry.url);
    });

    const palette = renderHook(() => useOverlayUrlState("palette"));
    const capture = renderHook(() => useOverlayUrlState("capture"));

    act(() => palette.result.current.openOverlay());
    expect(window.location.search).toBe("?palette=1");

    // Capture opens FROM WITHIN the palette — a composed transition, a real
    // pushState on top of palette's own entry.
    act(() => capture.result.current.openOverlay());
    expect(window.location.search).toBe("?palette=1&capture=1");

    // Esc #1: close capture. It still owns the entry it pushed, so this
    // consumes a real Back, landing on palette's own entry. `closeOverlay`
    // does not dispatch `popstate` itself (a real Back is asynchronous,
    // per every other test in this file) — fire it by hand, matching the
    // file's own established pattern.
    act(() => {
      capture.result.current.closeOverlay();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(capture.result.current.open).toBe(false);
    expect(palette.result.current.open).toBe(true);
    expect(window.location.search).toBe("?palette=1");
    expect(back).toHaveBeenCalledTimes(1);

    // Esc #2: close palette. It is standing on exactly the entry it itself
    // pushed (capture's own Back landed it there) — this must ALSO consume
    // a real Back, not silently degrade into a param-strip that leaves a
    // dead duplicate entry behind.
    back.mockClear();
    act(() => {
      palette.result.current.closeOverlay();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(palette.result.current.open).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});
