import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_AREAS_PARAM_VALUE,
  parseAreaParam,
  urlWithArea,
} from "@/lib/areaUrlParam";
import { useAreaUrlState } from "./useAreaUrlState";

/**
 * C2-S8 (#687 finding 1): the outbound push/pop half of the area switcher's
 * URL wiring. Mirrors useOverlayUrlState.test.ts's own jsdom pattern — jsdom
 * implements pushState/replaceState/location but not real Back/Forward, so
 * popstate assertions rewrite the URL the way a real pop would and dispatch
 * the event by hand.
 *
 * The initial-resolution / mount-self-heal / async-reconcile-correction
 * halves this hook deliberately does NOT own (see its own file header) are
 * covered instead in `src/__tests__/WorkflowContext.areas.test.tsx`, which
 * owns them.
 */

function goto(url: string) {
  window.history.replaceState(null, "", url);
}

const AREAS = [{ id: "area-main-job" }, { id: "area-personal" }];

describe("parseAreaParam", () => {
  it("absent param is undefined", () => {
    expect(parseAreaParam(null)).toBeUndefined();
  });

  it("the 'all' sentinel decodes to null", () => {
    expect(parseAreaParam(ALL_AREAS_PARAM_VALUE)).toBeNull();
  });

  it("any other string is returned verbatim as a candidate id", () => {
    expect(parseAreaParam("area-personal")).toBe("area-personal");
  });
});

describe("urlWithArea", () => {
  it("encodes null as the 'all' sentinel", () => {
    expect(urlWithArea({ pathname: "/", search: "" }, null)).toBe("/?area=all");
  });

  it("encodes a real id verbatim", () => {
    expect(urlWithArea({ pathname: "/", search: "" }, "area-personal")).toBe(
      "/?area=area-personal",
    );
  });

  it("preserves every other param already on the URL", () => {
    expect(
      urlWithArea({ pathname: "/", search: "?moment=start" }, "area-personal"),
    ).toBe("/?moment=start&area=area-personal");
  });
});

describe("useAreaUrlState", () => {
  beforeEach(() => {
    goto("/");
  });

  it("setArea pushes ?area= and updates the selection", () => {
    const setSelectedAreaId = vi.fn();
    const { result } = renderHook(() =>
      useAreaUrlState(setSelectedAreaId, AREAS),
    );

    act(() => result.current.setArea("area-personal"));

    expect(setSelectedAreaId).toHaveBeenCalledWith("area-personal");
    expect(window.location.search).toBe("?area=area-personal");
  });

  it("setArea(null) pushes the 'all' sentinel", () => {
    const setSelectedAreaId = vi.fn();
    const { result } = renderHook(() =>
      useAreaUrlState(setSelectedAreaId, AREAS),
    );

    act(() => result.current.setArea(null));

    expect(setSelectedAreaId).toHaveBeenCalledWith(null);
    expect(window.location.search).toBe("?area=all");
  });

  it("preserves other params already on the URL when switching", () => {
    goto("/?moment=start");
    const setSelectedAreaId = vi.fn();
    const { result } = renderHook(() =>
      useAreaUrlState(setSelectedAreaId, AREAS),
    );

    act(() => result.current.setArea("area-personal"));

    expect(window.location.search).toBe("?moment=start&area=area-personal");
  });

  it("switching to the area the URL already names does not stack a redundant entry", () => {
    goto("/?area=area-personal");
    const setSelectedAreaId = vi.fn();
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() =>
      useAreaUrlState(setSelectedAreaId, AREAS),
    );

    act(() => result.current.setArea("area-personal"));

    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("Back re-derives the area from the URL — the URL is the authority", () => {
    const setSelectedAreaId = vi.fn();
    renderHook(() => useAreaUrlState(setSelectedAreaId, AREAS));

    act(() => {
      goto("/?area=area-personal");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(setSelectedAreaId).toHaveBeenCalledWith("area-personal");
  });

  it("Back to the 'all' sentinel resolves to explicit All-areas", () => {
    const setSelectedAreaId = vi.fn();
    renderHook(() => useAreaUrlState(setSelectedAreaId, AREAS));

    act(() => {
      goto("/?area=all");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(setSelectedAreaId).toHaveBeenCalledWith(null);
  });

  it("popstate landing on an id no longer in the live area list resolves to All areas, not a ghost selection", () => {
    const setSelectedAreaId = vi.fn();
    renderHook(() => useAreaUrlState(setSelectedAreaId, AREAS));

    act(() => {
      goto("/?area=area-deleted");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(setSelectedAreaId).toHaveBeenCalledWith(null);
  });

  it("popstate landing on a pre-feature entry with no ?area= at all resolves to All areas", () => {
    const setSelectedAreaId = vi.fn();
    renderHook(() => useAreaUrlState(setSelectedAreaId, AREAS));

    act(() => {
      goto("/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(setSelectedAreaId).toHaveBeenCalledWith(null);
  });

  it("the popstate handler re-validates against a LATER areas list, not a stale one from first mount", () => {
    const setSelectedAreaId = vi.fn();
    const { rerender } = renderHook(
      ({ areas }) => useAreaUrlState(setSelectedAreaId, areas),
      { initialProps: { areas: AREAS } },
    );

    // A new area lands (e.g. the account sync arrives) after mount.
    rerender({ areas: [...AREAS, { id: "area-new" }] });

    act(() => {
      goto("/?area=area-new");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(setSelectedAreaId).toHaveBeenCalledWith("area-new");
  });
});
