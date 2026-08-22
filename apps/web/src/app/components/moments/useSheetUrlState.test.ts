import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyReplaceState } from "@/lib/rawHistory";
import { installNextRouterHistorySimulator } from "./nextRouterHistorySimulator";
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

  // RE-ANCHORED (Part of #687, "Back does nothing once" fix — see the
  // dedicated describe block below): this file's `goto()` helper is a bare
  // `replaceState(null, ...)`, which WIPES the landed-on entry's `state` —
  // including the `__lifeOSEntryId` a real Forward would have preserved. So
  // this test does NOT exercise a real Back+Forward (that walk is pinned for
  // real below, against a REAL history stack); it covers the narrower,
  // still-real case where identity genuinely CANNOT be recovered (the entry
  // we land on carries none of ours) — closing must still take the safe
  // strip branch, not guess `back()` off it.
  it("closing after landing on an entry with no ownership id of ours strips the param instead of guessing a Back", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));
    act(() => {
      goto("/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    // "Forward" via `goto()` lands on the right URL but, unlike a real
    // Forward, an entry with NO state of ours (see above) — so this is not
    // actually the entry `openSheet` pushed, ownership-wise.
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
 * helper above). `installNextRouterHistorySimulator` (extracted to
 * `nextRouterHistorySimulator.ts` so the mirrored defect this predicted on
 * `useOverlayUrlState` — Part of #687 — reuses the SAME model rather than a
 * drifting second copy) is a faithful model of just the three behaviors of
 * Next's history patch this defect depends on; see that file's own header
 * for the line-for-line verification against the installed `next@15.5.21`
 * source and what is deliberately NOT modeled (`startTransition`'s
 * deferral).
 */
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

/**
 * "Back does nothing once" (Part of #687, round-8 judge; observed
 * independently by two fresh-eyes judges). Pre-fix, `pushedRef` was a single
 * BOOLEAN, unconditionally cleared to `false` by `handlePopState` on EVERY
 * popstate — including a Forward that lands back on the EXACT entry
 * `openSheet` itself pushed. `closeSheet` read that cleared boolean and took
 * the `replaceState` branch instead of `back()`, stripping the CURRENT entry
 * (the one Forward just landed on) into a byte-for-byte duplicate of the
 * entry behind it. One `Back` from there landed on the duplicate — the
 * screen and URL were already "closed" before that Back, and were still
 * "closed" after it, so nothing visibly changed; a SECOND `Back` was needed
 * to reach a genuinely different entry. Reproduced against a real dev server
 * first (`nav-truth.spec.ts`'s own history-walk pin for this exact defect;
 * failed red on unfixed code with `expect(page.url()).not.toBe(urlBeforeSheet)`
 * — the final Back landed back on the SAME entry, not a further one) before
 * fixing here.
 *
 * Fix: track ownership by entry IDENTITY (`pushedEntryIdRef`, matching
 * `useOverlayUrlState`'s own mechanism) instead of a boolean — a real Forward
 * restores the landed-on entry's OWN `state`, id included, so `closeSheet`
 * now correctly recognizes it is still standing on its own pushed entry and
 * consumes a bare `back()`, never touching (or duplicating) the entry at
 * all.
 *
 * Cannot be exercised with this file's own `goto()` helper: `goto()` is a
 * bare `replaceState(null, ...)`, which WIPES the entry's `state` — including
 * `__lifeOSEntryId` — so it cannot stand in for a real Forward. This block
 * drives a REAL history stack instead (mirroring
 * `useOverlayUrlState.test.ts`'s own composed-nesting pattern): `pushState`/
 * `replaceState` apply for real; only `back()`/`forward()` (unimplemented in
 * jsdom, per this file's header) are mocked to perform the traversal a real
 * browser would, restoring whatever the stack ACTUALLY holds at that
 * position rather than a hardcoded snapshot.
 */
describe("useSheetUrlState — the 'Back does nothing once' artifact (#687 round-8)", () => {
  function installRealHistoryStack() {
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
    vi.spyOn(window.history, "back").mockImplementation(() => {
      position--;
      const entry = stack[position];
      realReplaceState(entry.state, "", entry.url);
    });
    vi.spyOn(window.history, "forward").mockImplementation(() => {
      position++;
      const entry = stack[position];
      realReplaceState(entry.state, "", entry.url);
    });
    return { stack };
  }

  beforeEach(() => {
    goto("/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("after Back+Forward, closing consumes its OWN Back rather than duplicating the current entry", () => {
    const { stack } = installRealHistoryStack();
    const back = vi.spyOn(window.history, "back");
    const { result } = renderHook(() => useSheetUrlState());

    act(() => result.current.openSheet("plan"));
    expect(window.location.search).toBe("?sheet=plan");

    // Back.
    act(() => {
      window.history.back();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.activeSheet).toBeNull();

    // Forward — a REAL forward, landing back on the exact entry `openSheet`
    // pushed, `state` (and its `__lifeOSEntryId`) intact, unlike `goto()`.
    act(() => {
      window.history.forward();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.activeSheet).toBe("plan");

    back.mockClear();
    act(() => result.current.closeSheet());
    expect(result.current.activeSheet).toBeNull();
    expect(window.location.search).toBe(""); // screen and URL agree right now

    // The fix: `closeSheet` recognizes it is STILL standing on the entry it
    // pushed (Forward preserved its id) and consumes its own Back, exactly
    // like the un-Forwarded "just opened, immediate close" case already
    // pinned above — not a strip.
    expect(back).toHaveBeenCalledTimes(1);

    // No duplicate: entry 1 (the one Forward landed on) was NEVER
    // replaceState'd — `back()` alone moved position off it, leaving its
    // content untouched in the stack, unlike the pre-fix artifact.
    expect(stack[1].url).toBe("/?sheet=plan");
    expect(stack[1].url).not.toBe(stack[0].url);
  });

  /**
   * #897's own investigation named its two CI sightings at
   * `review-port-truth.spec.ts:289` and `health-port-truth.spec.ts:330`,
   * always on the walk "open -> reload -> Back -> Forward -> close". Those
   * two specs are `@signed-in` (require a real Supabase stack this lane has
   * no credentials for — `requireSupabaseEnv()` throws before the browser
   * even opens), so they could not be run directly to confirm this fix
   * leaves that walk unaffected. This pins the same walk's LOGIC instead: a
   * reload unmounts the hook and mounts a fresh instance, which the mount-
   * time deep-link effect (`TodayMoments.tsx`'s `adoptSheetFromUrl(target.sheet)`)
   * hands the URL-named sheet via `adoptSheetFromUrl` — the SAME call that
   * clears `pushedEntryIdRef` to `null` on every adopt. A subsequent Forward
   * lands back on the entry the PRE-reload `openSheet` originally pushed
   * (its own id still intact in `history.state`, a real reload does not
   * touch entries other than the current one) — but the fresh instance
   * never recorded that id itself, so `stillOnOurEntry` is false regardless
   * of what id the entry carries, and `closeSheet` takes the same strip
   * branch it always took here, pre- and post-fix. The entry-identity fix
   * only changes behavior for a Forward reached WITHOUT an intervening
   * remount — precisely the case #897's CI sightings did not exercise.
   */
  it("PIN (#897 CI sightings): open -> reload (fresh hook instance) -> Back -> Forward -> close still strips via replaceState, unaffected by the entry-identity fix", () => {
    installRealHistoryStack();
    const first = renderHook(() => useSheetUrlState());
    act(() => first.result.current.openSheet("review"));
    expect(window.location.search).toBe("?sheet=review");

    // Reload: unmount the old instance, mount a fresh one that adopts the
    // sheet the URL already names — exactly `TodayMoments.tsx`'s own mount-
    // time deep-link effect.
    first.unmount();
    const back = vi.spyOn(window.history, "back");
    const reloaded = renderHook(() => useSheetUrlState());
    act(() => reloaded.result.current.adoptSheetFromUrl("review"));
    expect(reloaded.result.current.activeSheet).toBe("review");

    // Back.
    act(() => {
      window.history.back();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(reloaded.result.current.activeSheet).toBeNull();

    // Forward — lands back on the PRE-reload entry, id and all, but this
    // FRESH instance never pushed it itself.
    act(() => {
      window.history.forward();
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(reloaded.result.current.activeSheet).toBe("review");

    back.mockClear();
    act(() => reloaded.result.current.closeSheet());

    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});
