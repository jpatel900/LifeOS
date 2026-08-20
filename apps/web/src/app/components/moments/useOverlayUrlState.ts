"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Final UX Loop C2-S7 (#687 finding 2) — the `useSheetUrlState`-shaped hook
 * for a BOOLEAN overlay, named in PR #880's AGENT-TODO. `captureOpen` and
 * `paletteOpen` were plain `useState<boolean>`: opening from the C key, the
 * capture pill, Cmd/Ctrl+K, or BottomNavigator's Capture/More buttons wrote
 * nothing to the URL, though `/capture` (a redirect shim) already lands on
 * exactly `?capture=1` and that URL survives reload — only the OUTBOUND
 * tap-to-URL write was missing (the VERIFIED GAP `nav-truth.spec.ts`'s matrix
 * pin recorded). Same open/close/adopt contract as `useSheetUrlState`,
 * parameterized on which query key ("capture" | "palette") the overlay owns
 * — `TodayMoments.tsx` instantiates one of these per overlay, matching how it
 * already holds one `useSheetUrlState()` for every sheet.
 *
 * ## The one thing this hook does that `useSheetUrlState` does not need to:
 * survive being closed by something ELSE's push.
 *
 * The command palette can open capture or a sheet from INSIDE itself
 * (`runPaletteAction`'s "open-capture"/"open-triage"/etc cases) —
 * `CommandPalette.tsx` calls `onRun` and THEN `onClose`, so the destination's
 * own `openOverlay`/`openSheet` pushes a new entry, and only after that does
 * the palette's own `closeOverlay` run. A naive "did I push, then `back()`"
 * (`useSheetUrlState`'s own rule) would `back()` PAST the destination's fresh
 * entry, undoing the very navigation the user just took — caught red-first
 * while wiring this in: `runPaletteAction("open-capture")` left the capture
 * overlay rendered on screen while `window.location` reverted to
 * `?palette=1`, a screen/URL disagreement of exactly the kind this whole
 * slice exists to remove.
 *
 * `window.history.length` only ever GROWS on a genuine `pushState`, from ANY
 * caller (`nav-truth.spec.ts`'s own HISTORY-WALK PIN documents the same
 * fact) — so recording the length right after our own push, and comparing it
 * at close time, tells us for free whether our entry is still the live top of
 * the stack or has already been buried under someone else's: unchanged means
 * safe to `back()` (our entry is still on top, nothing to undo but our own
 * open); grown means something else pushed since, so this close only strips
 * OUR param from whatever the current entry now is — the destination's push
 * survives untouched, and a Back after that composed transition undoes the
 * destination first, landing back on this overlay (matching what the user
 * actually did), exactly as `closeSheet`'s own no-history-theft rule already
 * guarantees for a sheet reached by URL rather than by this hook's own push.
 */

export function parseOverlayParam(value: string | null): boolean {
  return value === "1" || value === "true" || value === "";
}

/** Current URL with `param` set to `"1"`, or removed when `open` is false. */
export function urlWithOverlay(
  location: { pathname: string; search: string },
  param: "capture" | "palette",
  open: boolean,
): string {
  const params = new URLSearchParams(location.search);
  if (open) {
    params.set(param, "1");
  } else {
    params.delete(param);
  }
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}`;
}

export interface OverlayUrlState {
  open: boolean;
  /** Opens the overlay AND records it in the URL (pushes a history entry). */
  openOverlay(): void;
  /** Closes whatever is open and returns the URL to where it was. */
  closeOverlay(): void;
  /**
   * Applies an overlay state the URL ALREADY carries (the mount-time deep
   * link, or a sibling write that already put it there). Writes no history.
   */
  adoptOverlayFromUrl(open: boolean): void;
}

export function useOverlayUrlState(
  param: "capture" | "palette",
): OverlayUrlState {
  const [open, setOpen] = useState(false);

  // The `history.length` right after OUR OWN push, or null when we did not
  // push the current entry (adopted from the URL, or never opened). See the
  // file header for why length — not a boolean — is what makes closing safe
  // under composition with another hook's push.
  const openedAtLengthRef = useRef<number | null>(null);

  useEffect(() => {
    function handlePopState() {
      openedAtLengthRef.current = null;
      setOpen(
        parseOverlayParam(
          new URLSearchParams(window.location.search).get(param),
        ),
      );
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [param]);

  const openOverlay = useCallback(() => {
    setOpen(true);
    if (typeof window === "undefined") return;
    // Already on this overlay's URL (e.g. re-opening after a deep link):
    // keep the stack flat rather than stacking an identical entry.
    if (
      parseOverlayParam(
        new URLSearchParams(window.location.search).get(param),
      )
    ) {
      return;
    }
    window.history.pushState(
      null,
      "",
      urlWithOverlay(window.location, param, true),
    );
    openedAtLengthRef.current = window.history.length;
  }, [param]);

  const closeOverlay = useCallback(() => {
    setOpen(false);
    if (typeof window === "undefined") return;
    const stillOnOurEntry =
      openedAtLengthRef.current !== null &&
      window.history.length === openedAtLengthRef.current;
    openedAtLengthRef.current = null;
    if (stillOnOurEntry) {
      // Strip our own param SYNCHRONOUSLY, via `replaceState`, before
      // calling `back()` — never rely on `back()` itself to make
      // `window.location` agree. `history.back()` is asynchronous in every
      // browser (it queues a traversal; `popstate` fires on a later task),
      // not only in jsdom. Real, reachable race this closes: Escape, then
      // re-open fast, before that traversal has landed — `openOverlay`'s own
      // dedupe reads the CURRENT url first, and without this line it would
      // still say our param, decline to push a fresh entry (the pending
      // pop already reflects "closed" as far as REACT state, so `open`
      // would be true with no entry backing it) — then, when the delayed
      // pop finally lands, its popstate handler closes the overlay the user
      // just reopened. Stripping here first means the URL already agrees
      // with "closed" the instant this function returns, so that early
      // return never fires on stale information.
      window.history.replaceState(
        null,
        "",
        urlWithOverlay(window.location, param, false),
      );
      window.history.back();
      return;
    }
    // Either we never pushed (adopted from the URL), or something else
    // pushed since we did (the palette-runs-an-action composition above) —
    // either way, `back()` is not ours to take. Strip only our own param
    // from whatever the current entry now is.
    window.history.replaceState(
      null,
      "",
      urlWithOverlay(window.location, param, false),
    );
  }, [param]);

  const adoptOverlayFromUrl = useCallback((next: boolean) => {
    openedAtLengthRef.current = null;
    setOpen(next);
  }, []);

  return { open, openOverlay, closeOverlay, adoptOverlayFromUrl };
}
