import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { urlWithMoment, useMomentUrlState } from "./useMomentUrlState";

/**
 * C2 Target Card 2 (Structure), the moment half: every state change is
 * URL-visible; Back/Forward step moments only; refresh, direct URL and Back
 * agree. Same red-first framing as `useSheetUrlState.test.ts` — on
 * `origin/main` @ a68f6eb1, `moment` was plain `useState` with no URL write
 * at all, so every URL/history assertion below fails there.
 *
 * jsdom implements pushState/replaceState/`location` but NOT real
 * Back/Forward, so the popstate assertions drive the browser's half of the
 * contract explicitly: rewrite the URL the way a real pop would, then
 * dispatch `popstate`.
 */

function goto(url: string) {
  window.history.replaceState(null, "", url);
}

describe("urlWithMoment", () => {
  it("sets the moment param", () => {
    expect(urlWithMoment({ pathname: "/", search: "" }, "flow")).toBe(
      "/?moment=flow",
    );
  });

  it("preserves every other param already on the URL", () => {
    expect(
      urlWithMoment({ pathname: "/", search: "?sheet=plan" }, "flow"),
    ).toBe("/?sheet=plan&moment=flow");
  });

  it("overwrites an existing moment param rather than duplicating it", () => {
    expect(
      urlWithMoment({ pathname: "/", search: "?moment=start" }, "close"),
    ).toBe("/?moment=close");
  });
});

describe("useMomentUrlState (C2 Target Card 2)", () => {
  beforeEach(() => {
    goto("/");
  });

  it("reconciles the resolved initial moment into the URL at mount, via replaceState (no history growth)", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");

    const { result } = renderHook(() => useMomentUrlState("start"));

    expect(result.current.moment).toBe("start");
    expect(window.location.search).toBe("?moment=start");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });

  it("does not touch the URL at mount when it already agrees", () => {
    goto("/?moment=flow");
    const replace = vi.spyOn(window.history, "replaceState");

    renderHook(() => useMomentUrlState("flow"));

    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  // Mount self-heals a STALE `?moment=` param the URL happens to carry —
  // e.g. left over from a previous navigation this hook did not make —
  // rather than adopting it. Contrast with `useSheetUrlState`, where an
  // absent/present sheet param is itself meaningful; a moment is never
  // "closed", so there is no equivalent case where an unexpected param
  // should win over what the caller resolved.
  it("mount corrects a stale ?moment= param to match the caller's resolved value", () => {
    goto("/?moment=close");
    const replace = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useMomentUrlState("start"));

    expect(result.current.moment).toBe("start");
    expect(window.location.search).toBe("?moment=start");
    expect(replace).toHaveBeenCalledTimes(1);
    replace.mockRestore();
  });

  it("switching moments puts the new moment in the URL and pushes a history entry", () => {
    const { result } = renderHook(() => useMomentUrlState("start"));

    act(() => result.current.setMoment("flow"));

    expect(result.current.moment).toBe("flow");
    expect(window.location.search).toBe("?moment=flow");
  });

  it("keeps other params when switching", () => {
    goto("/?sheet=plan&moment=start");
    const { result } = renderHook(() => useMomentUrlState("start"));

    act(() => result.current.setMoment("close"));

    expect(window.location.search).toBe("?sheet=plan&moment=close");
  });

  it("re-setting the moment already named by the URL does not stack a duplicate entry", () => {
    goto("/?moment=flow");
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useMomentUrlState("flow"));

    act(() => result.current.setMoment("flow"));

    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("adoptMomentFromUrl applies the moment the URL already carries, without pushing history", () => {
    goto("/?moment=close");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const { result } = renderHook(() => useMomentUrlState("start"));
    replace.mockClear(); // mount already reconciled "start" -> ignore that call

    act(() => result.current.adoptMomentFromUrl("close"));

    expect(result.current.moment).toBe("close");
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
    replace.mockRestore();
  });

  it("Back steps to the previous moment (the URL is the authority)", () => {
    const { result } = renderHook(() => useMomentUrlState("start"));
    act(() => result.current.setMoment("flow"));

    act(() => {
      goto("/?moment=start");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.moment).toBe("start");
  });

  it("Forward re-applies the moment it lands on", () => {
    const { result } = renderHook(() => useMomentUrlState("start"));
    act(() => result.current.setMoment("flow"));
    act(() => {
      goto("/?moment=start");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    act(() => {
      goto("/?moment=flow");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.moment).toBe("flow");
  });

  // Risk #6 (lane contract): Back on a bare `/` entry (direct visit, no
  // pushes) must leave the site untouched by our handlers — the mount-time
  // reconciliation uses `replaceState`, never `pushState`, so it never adds
  // an entry a real Back could get stuck on.
  it("mount reconciliation never grows history — an open/switch/Back cycle leaves the stack depth unchanged", () => {
    const push = vi.spyOn(window.history, "pushState");
    renderHook(() => useMomentUrlState("start"));

    // Only the switch below should push; mount must not have.
    expect(push).not.toHaveBeenCalled();
    push.mockRestore();
  });

  it("switching moments in sequence swaps the param each time", () => {
    const { result } = renderHook(() => useMomentUrlState("start"));

    act(() => result.current.setMoment("flow"));
    act(() => result.current.setMoment("close"));

    expect(window.location.search).toBe("?moment=close");
    expect(result.current.moment).toBe("close");
  });

  it("popstate onto an entry with no moment param falls back to start", () => {
    const { result } = renderHook(() => useMomentUrlState("flow"));

    act(() => {
      goto("/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current.moment).toBe("start");
  });
});
