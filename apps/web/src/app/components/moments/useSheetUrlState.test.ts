import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { urlWithSheet, useSheetUrlState } from "./useSheetUrlState";

/**
 * C2 Target Card 2 (Structure): every state change is URL-visible;
 * Back/Forward step moments only; refresh, direct URL and Back agree.
 *
 * Red-first on `origin/main` @ c4f96315: `activeSheet` was plain `useState`
 * with no URL write at all, so "opening a sheet puts it in the URL" and every
 * Back/Forward assertion below fails there.
 *
 * jsdom implements pushState/replaceState/`location` but NOT real
 * Back/Forward, so the popstate assertions drive the browser's half of the
 * contract explicitly: rewrite the URL the way a real pop would, then
 * dispatch `popstate`. What is under test is that the hook re-reads the URL
 * as the authority — which is the property that makes refresh, a direct URL
 * and Back agree.
 */

function goto(url: string) {
  window.history.replaceState(null, "", url);
}

describe("urlWithSheet", () => {
  it("adds the sheet param", () => {
    expect(urlWithSheet({ pathname: "/", search: "" }, "plan")).toBe(
      "/?sheet=plan",
    );
  });

  it("preserves every other param already on the URL", () => {
    expect(
      urlWithSheet({ pathname: "/", search: "?moment=start" }, "plan"),
    ).toBe("/?moment=start&sheet=plan");
  });

  it("removes only the sheet param when closing", () => {
    expect(
      urlWithSheet({ pathname: "/", search: "?moment=start&sheet=plan" }, null),
    ).toBe("/?moment=start");
  });

  it("leaves a bare path with no trailing question mark", () => {
    expect(urlWithSheet({ pathname: "/", search: "?sheet=plan" }, null)).toBe(
      "/",
    );
  });
});

describe("useSheetUrlState (C2 Target Card 2)", () => {
  beforeEach(() => {
    goto("/");
  });

  it("puts the open sheet in the URL", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));

    expect(result.current.activeSheet).toBe("plan");
    expect(window.location.search).toBe("?sheet=plan");
  });

  it("keeps other params when opening", () => {
    goto("/?moment=start");
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));

    expect(window.location.search).toBe("?moment=start&sheet=plan");
  });

  it("closing a sheet WE opened steps back rather than growing history", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));
    act(() => result.current.closeSheet());

    expect(result.current.activeSheet).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("closing a sheet arrived at BY URL strips the param instead of stealing a Back", () => {
    // A direct link, a bookmark, or a redirect from a demoted stage route.
    goto("/?sheet=plan");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.adoptSheetFromUrl("plan"));
    expect(result.current.activeSheet).toBe("plan");

    act(() => result.current.closeSheet());

    expect(result.current.activeSheet).toBeNull();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    back.mockRestore();
  });

  it("Back closes the sheet (the URL is the authority)", () => {
    const { result } = renderHook(() => useSheetUrlState());
    act(() => result.current.openSheet("plan"));

    act(() => {
      goto("/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.activeSheet).toBeNull();
  });

  it("Forward re-opens the same sheet", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => {
      goto("/?sheet=plan");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.activeSheet).toBe("plan");
  });

  it("after a Back, closing never consumes a second Back", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));
    act(() => {
      goto("/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // Forward again, then close with the button.
    act(() => {
      goto("/?sheet=plan");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    back.mockClear();
    act(() => result.current.closeSheet());

    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
    back.mockRestore();
  });

  it("re-opening the sheet already named by the URL does not stack an entry", () => {
    goto("/?sheet=plan");
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));

    expect(result.current.activeSheet).toBe("plan");
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("switching sheets swaps the param", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("triage"));
    act(() => result.current.openSheet("plan"));

    expect(window.location.search).toBe("?sheet=plan");
    expect(result.current.activeSheet).toBe("plan");
  });
});
