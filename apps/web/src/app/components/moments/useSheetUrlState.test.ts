import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyReplaceState } from "@/lib/rawHistory";
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

  // C2-S3: the ported Review surface has to satisfy Target Card 2 from birth,
  // so it is held to the same four behaviours as the other two sheets.
  it("the review sheet is URL-visible, refresh-stable and Back-correct", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("review"));
    expect(window.location.search).toBe("?sheet=review");

    // A refresh (or a direct URL) lands on that entry and adopts it.
    goto("/?sheet=review");
    const reloaded = renderHook(() => useSheetUrlState());
    act(() => reloaded.result.current.adoptSheetFromUrl("review"));
    expect(reloaded.result.current.activeSheet).toBe("review");

    // Back is authoritative: the URL, not a guess, decides the sheet.
    goto("/");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(reloaded.result.current.activeSheet).toBeNull();
  });

  it("switching sheets swaps the param", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("triage"));
    act(() => result.current.openSheet("plan"));

    expect(window.location.search).toBe("?sheet=plan");
    expect(result.current.activeSheet).toBe("plan");
  });
});

/**
 * #897 — "C2 Target Card 2: ... refresh, Back and Forward all agree" failed
 * intermittently in CI (2 sightings: review-port-truth.spec.ts:289,
 * health-port-truth.spec.ts:330), always on the SAME walk: open -> reload ->
 * Back -> Forward -> close. Investigation verdict: PRODUCT bug, not a test
 * artifact. `closeSheet`'s `historyReplaceState` branch bypasses Next's own
 * App Router history patch (by design — see `rawHistory.ts`'s header, this
 * is what stops a DIFFERENT race), so Next's `HistoryUpdater` never learns
 * the sheet closed. Next's stored `canonicalUrl` stays at the stale
 * `?sheet=<x>` forever, and the next time ANYTHING ELSE in the app causes an
 * `appRouterState` change, `HistoryUpdater`'s `useInsertionEffect`
 * unconditionally stamps that stale `canonicalUrl` back onto the address
 * bar — reopening, in the URL only, a sheet the screen already closed.
 *
 * jsdom never mounts a real App Router, so this defect is invisible to the
 * other tests in this file (all of which use the bare `goto()` + `popstate`
 * helper above). The harness below is a faithful model of just the three
 * behaviors of Next's history patch this defect depends on — verified line
 * for line against the installed `next@15.5.21` source
 * (`node_modules/next/dist/client/components/app-router.js`,
 * `.../router-reducer/reducers/restore-reducer.js`):
 *
 *   1. `:309-333` — a `pushState`/`replaceState` call whose `state` already
 *      carries `__NA` or `_N` is Next's OWN write, forwarded unchanged:
 *      `canonicalUrl` does NOT change. A call WITHOUT either marker is
 *      external: Next stamps `__NA` onto the entry regardless
 *      (`copyNextJsInternalHistoryState`, `:144-156`) and schedules
 *      `canonicalUrl` to become the new url (`applyUrlFromHistoryPushReplace`
 *      -> `ACTION_RESTORE` -> `restoreReducer`, which reuses `state.cache`/
 *      `state.tree` rather than fetching or remounting anything).
 *   2. `HistoryUpdater`'s `useInsertionEffect` (`:89-113`) — on EVERY
 *      `appRouterState` change, for ANY reason, anywhere in the app,
 *      unconditionally re-stamps the CURRENT `canonicalUrl` onto the address
 *      bar via `replaceState`. Modeled as `fireHistoryUpdater()` below —
 *      standing in for "some unrelated later navigation happened".
 *   3. Native Back/Forward traversal (Next's own `onPopState` ->
 *      `dispatchTraverseAction`) sets `canonicalUrl` to whatever URL was
 *      traversed to. `traverse()` wraps this file's existing `goto()` +
 *      `popstate` pattern and additionally updates the modeled
 *      `canonicalUrl` to match — without this, `canonicalUrl` would still
 *      read the PRE-Forward url at close time and the reproduction below
 *      would be right for the wrong reason.
 *
 * NOT modeled: `startTransition`'s deferral (both (1)'s resync and (2)'s
 * re-stamp are applied here synchronously, not scheduled). A fix proven
 * against this harness closes the UNBOUNDED staleness window (stale until
 * some later, unrelated navigation cashes it in) down to a sub-render-tick
 * one; whether that residual window is ever user-observable is a
 * live-browser question the PR states as unverified at this tier.
 */
function installNextRouterHistorySimulator() {
  const nativePushState = window.history.pushState.bind(window.history);
  const nativeReplaceState = window.history.replaceState.bind(window.history);
  const initialUrl = window.location.pathname + window.location.search;
  let canonicalUrl = initialUrl;

  function hasNextMarker(state: unknown): boolean {
    if (!state || typeof state !== "object") return false;
    const s = state as Record<string, unknown>;
    return Boolean(s.__NA) || Boolean(s._N);
  }

  function patch(
    native: typeof window.history.pushState,
  ): typeof window.history.pushState {
    return function patched(
      this: History,
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) {
      if (hasNextMarker(data)) {
        // Next's own write (or ours, deliberately marked to look like one):
        // forwarded unchanged, canonicalUrl untouched.
        return native.call(window.history, data, unused, url ?? undefined);
      }
      // External write: Next stamps its own marker onto the entry regardless
      // (`copyNextJsInternalHistoryState`) and resyncs canonicalUrl to match.
      const stamped =
        data && typeof data === "object"
          ? { ...(data as Record<string, unknown>), __NA: true }
          : { __NA: true };
      if (url != null) canonicalUrl = String(url);
      return native.call(window.history, stamped, unused, url ?? undefined);
    };
  }

  window.history.pushState = patch(nativePushState);
  window.history.replaceState = patch(nativeReplaceState);
  // Seed the root entry as already Next-owned — matching a mounted app whose
  // first `HistoryUpdater` insertion effect already ran (rawHistory.ts's own
  // header: "once Next has stamped anything").
  nativeReplaceState({ __NA: true }, "", initialUrl);

  return {
    /** Simulates `HistoryUpdater` firing for a completely unrelated reason
     * elsewhere in the app: re-stamps whatever canonicalUrl Next is
     * currently holding onto the address bar. */
    fireHistoryUpdater() {
      nativeReplaceState({ __NA: true }, "", canonicalUrl);
    },
    /** Simulates the browser landing on a different history entry (Back or
     * Forward) and Next's own popstate handler resyncing to it. Passes
     * `{ __NA: true }` rather than `null` (unlike this file's plain
     * `goto()`) because a real traversed-to entry already carries whatever
     * Next stamped on it when it was created — it is never wiped. */
    traverse(url: string) {
      nativeReplaceState({ __NA: true }, "", url);
      canonicalUrl = url;
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    getCanonicalUrl: () => canonicalUrl,
    restore() {
      window.history.pushState = nativePushState;
      window.history.replaceState = nativeReplaceState;
    },
  };
}

describe("useSheetUrlState keeps Next's canonicalUrl in sync (#897)", () => {
  let sim: ReturnType<typeof installNextRouterHistorySimulator>;

  beforeEach(() => {
    goto("/");
    sim = installNextRouterHistorySimulator();
  });

  afterEach(() => {
    sim.restore();
  });

  it("REGRESSION: closing a sheet after Back+Forward keeps the URL agreeing even after a LATER, unrelated router-state change", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("health"));
    expect(window.location.search).toBe("?sheet=health");

    // Back
    act(() => sim.traverse("/"));
    expect(result.current.activeSheet).toBeNull();

    // Forward
    act(() => sim.traverse("/?sheet=health"));
    expect(result.current.activeSheet).toBe("health");
    // Sanity check on the harness itself: Next's own canonicalUrl really is
    // "?sheet=health" right after Forward, same as a real traversal — if
    // this fails, the reproduction below would be right for the wrong
    // reason.
    expect(sim.getCanonicalUrl()).toBe("/?sheet=health");

    // Close
    act(() => result.current.closeSheet());
    expect(result.current.activeSheet).toBeNull();
    expect(window.location.search).toBe(""); // screen and URL agree right now

    // A LATER, totally unrelated Next.js router-state change elsewhere in
    // the app (any navigation at all) re-runs HistoryUpdater.
    act(() => sim.fireHistoryUpdater());

    // #897: on unfixed `closeSheet`, this reintroduces "?sheet=health" — the
    // close only ever agreed for as long as nothing else in the app touched
    // the router meanwhile.
    expect(window.location.search).toBe("");
    expect(result.current.activeSheet).toBeNull();
  });

  it("mirror, predicted by the investigation: opening a sheet keeps ?sheet= present after a later router-state change", () => {
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("health"));
    expect(window.location.search).toBe("?sheet=health");

    act(() => sim.fireHistoryUpdater());

    // #897: on unfixed `openSheet`, this strips "?sheet=health" — the same
    // staleness defect, symmetric on open.
    expect(window.location.search).toBe("?sheet=health");
  });

  it("protects the default (no-option) write path other callers rely on", () => {
    // `useOverlayUrlState.closeOverlay`'s `stillOnOurEntry` branch calls
    // `historyReplaceState` immediately before a synchronous
    // `window.history.back()` — it must never resync (see rawHistory.ts's
    // file header for the race that reopens). Calling `historyReplaceState`
    // with no options must leave Next's canonicalUrl untouched, regardless
    // of this file's fix.
    historyReplaceState("/?sheet=health");
    expect(sim.getCanonicalUrl()).toBe("/");
  });
});
