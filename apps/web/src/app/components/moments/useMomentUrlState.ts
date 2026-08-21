"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { historyPushState, historyReplaceState } from "@/lib/rawHistory";
import type { MomentValue } from "./MomentSwitcher";

/**
 * Final UX Loop C2 — Target Card 2 (Structure), the moment half. Same
 * contract as `useSheetUrlState`, extended rather than duplicated: raw
 * `window.history`, popstate authoritative, Back/Forward and refresh agree
 * by construction.
 *
 * ## What was broken (P6, #687)
 *
 * `TodayMoments` held `moment` in a bare `useState`; `MomentSwitcher`,
 * `BottomNavigator`, keyboard shortcuts and the pipeline rail's Execute-node
 * drill all called `setMoment` directly. None of that wrote the URL or
 * history: switching moments left the address bar unchanged, a refresh could
 * land on a different moment than the one on screen (the clock-driven
 * heuristic re-runs), and Back left the site entirely instead of stepping to
 * the previous moment.
 *
 * ## The contract this hook implements
 *
 * - **`setMoment`** pushes a history entry carrying `?moment=<value>`,
 *   preserving every other query param already on the URL. Unlike sheets,
 *   moments have no "closed" state to return to — every switch is a forward
 *   step, so Back/Forward naturally walk the moment history without any
 *   close-side bookkeeping.
 * - **`adoptMomentFromUrl`** applies a moment the URL ALREADY carries (the
 *   mount-time deep link from a redirect shim, e.g. `/execute` ->
 *   `/?moment=flow`) — writes no history, matching
 *   `useSheetUrlState.adoptSheetFromUrl`.
 * - **Mount** takes `resolvedInitialMoment` as already fully resolved by the
 *   caller — `initialMoment` prop (test-only override) -> the URL's own
 *   `?moment=` param -> stored preference -> clock heuristic, in that order
 *   (`TodayMoments.tsx` computes it; this hook does not re-derive it, so
 *   there is exactly one place that order lives). It then `replaceState`s
 *   the resolved value into the URL — a no-op whenever the URL already
 *   agreed, which is always true on the redirect-shim path (`/execute` ->
 *   `/?moment=flow`) and self-healing whenever it does not (a stale
 *   `?moment=` a previous navigation left behind gets corrected to match
 *   what actually rendered) — without growing history (a bare `/` visit
 *   still leaves exactly the one entry behind it — Back from there must
 *   leave the site untouched by this hook, never get intercepted).
 *   URL-priority living INSIDE this hook instead of in the caller was a
 *   real, caught red-first bug: it could not tell a genuine `initialMoment`
 *   test override from a stale leftover URL param from an unrelated earlier
 *   render, so it occasionally overrode the override.
 * - **popstate** (Back/Forward) is authoritative: the moment is re-read from
 *   the URL, never guessed. An entry with no `?moment=` param (a pre-feature
 *   bookmark, or a manually edited URL) falls back to `"start"` rather than
 *   leaving React state disagreeing with a blank URL.
 *
 * Deliberately raw `window.history`, not `router.push`: an App Router
 * navigation would re-render the route and remount every moment's own state
 * on each switch.
 */

export function parseMomentParam(value: string | null): MomentValue | null {
  return value === "start" || value === "flow" || value === "close"
    ? value
    : null;
}

/** Current URL with `moment` set to `moment`. */
export function urlWithMoment(
  location: { pathname: string; search: string },
  moment: MomentValue,
): string {
  const params = new URLSearchParams(location.search);
  params.set("moment", moment);
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}`;
}

export interface MomentUrlState {
  moment: MomentValue;
  /** Switches moment AND records it in the URL (pushes a history entry). */
  setMoment(moment: MomentValue): void;
  /**
   * Applies a moment the URL ALREADY carries (the mount-time deep link).
   * Writes no history: the entry that named the moment is the one we are
   * standing on.
   */
  adoptMomentFromUrl(moment: MomentValue): void;
}

export function useMomentUrlState(
  resolvedInitialMoment: MomentValue,
): MomentUrlState {
  const [moment, setMomentState] = useState<MomentValue>(resolvedInitialMoment);

  // Mount only: make the URL agree with the already-resolved initial moment,
  // via `replaceState` (never `pushState`) so a plain `/` visit still leaves
  // exactly one history entry behind it. A no-op whenever the URL already
  // agreed (the redirect-shim path); self-healing otherwise (a stale
  // `?moment=` param left by a previous navigation is corrected to match
  // what the caller actually resolved and rendered).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (typeof window === "undefined") return;
    const fromUrl = parseMomentParam(
      new URLSearchParams(window.location.search).get("moment"),
    );
    if (fromUrl === resolvedInitialMoment) return;
    historyReplaceState(urlWithMoment(window.location, resolvedInitialMoment));
    // Deliberately empty deps: this mirrors the old `useState` lazy
    // initializer it replaces — the resolved value is read once, at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePopState() {
      const fromUrl = parseMomentParam(
        new URLSearchParams(window.location.search).get("moment"),
      );
      setMomentState(fromUrl ?? "start");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const setMoment = useCallback((next: MomentValue) => {
    setMomentState(next);
    if (typeof window === "undefined") return;
    const current = parseMomentParam(
      new URLSearchParams(window.location.search).get("moment"),
    );
    if (current === next) return;
    historyPushState(urlWithMoment(window.location, next));
  }, []);

  const adoptMomentFromUrl = useCallback((next: MomentValue) => {
    setMomentState(next);
  }, []);

  return { moment, setMoment, adoptMomentFromUrl };
}
