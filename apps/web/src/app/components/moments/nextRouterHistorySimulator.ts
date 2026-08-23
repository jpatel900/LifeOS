/**
 * Shared jsdom model of Next's App Router `pushState`/`replaceState` patch,
 * extracted from `useSheetUrlState.test.ts` (#897) so the mirrored canonical-
 * URL-staleness defect on `useOverlayUrlState` (Part of #687) can reuse the
 * SAME model rather than a second hand copy drifting from the first.
 *
 * jsdom never mounts a real App Router, so the specific defect this models —
 * a bypassed history write leaving Next's internal `canonicalUrl` stale until
 * some later, unrelated `appRouterState` change stamps it back onto the
 * address bar — is otherwise invisible at this tier. Verified line-for-line
 * against the installed `next@15.5.21` source
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
 *      traversed to. `traverse()` wraps the plain `goto()` + `popstate`
 *      pattern each test file's own helper already uses, and additionally
 *      updates the modeled `canonicalUrl` to match — without this,
 *      `canonicalUrl` would still read the PRE-traversal url and a
 *      reproduction built on it would be right for the wrong reason.
 *
 * NOT modeled: `startTransition`'s deferral (both (1)'s resync and (2)'s
 * re-stamp are applied here synchronously, not scheduled). A fix proven
 * against this harness closes the UNBOUNDED staleness window (stale until
 * some later, unrelated navigation cashes it in) down to one bounded by
 * whenever React flushes that transition — NOT one render tick; #897's own
 * CI evidence had a stale stamp land ~83ms after the strip, with no
 * guaranteed ordering against whatever else runs in between. Whether that
 * residual window is ever user-observable is a live-browser question each
 * consuming PR states as unverified at this tier.
 */
export function installNextRouterHistorySimulator() {
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
     * `{ __NA: true }` rather than `null` (unlike a plain `goto()`) because a
     * real traversed-to entry already carries whatever Next stamped on it
     * when it was created — it is never wiped. */
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
