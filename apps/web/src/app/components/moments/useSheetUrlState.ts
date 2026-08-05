"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSheetValue, type SheetValue } from "./sheetValues";

/**
 * Final UX Loop C2 — Target Card 2 (Structure): "every state change is
 * URL-visible; Back/Forward step moments only; refresh, direct URL and Back
 * agree."
 *
 * ## What was broken
 *
 * `?sheet=plan` / `?sheet=triage` were read INBOUND only (`deepLink.ts` ->
 * `TodayMoments`' one-shot deep-link effect). Opening the same sheet from the
 * Pipeline rail wrote nothing to the URL, so:
 *
 * - the address bar disagreed with the screen,
 * - a refresh silently closed the sheet,
 * - Back left the home entirely instead of closing the sheet,
 * - the surface could not be linked to or bookmarked from where it was opened.
 *
 * ## The contract this hook implements
 *
 * - **Open** pushes a history entry carrying `?sheet=<value>`, preserving
 *   every other query param already on the URL.
 * - **Close** undoes exactly what opening did. When THIS hook pushed the
 *   entry, closing is `history.back()` — one step back, no history growth, so
 *   an open/close cycle leaves the stack exactly as it found it. When the
 *   sheet was reached some other way (a direct URL, a bookmark, a redirect
 *   from a demoted stage route), there is nothing of ours to pop, so closing
 *   strips the param with `replaceState` and never steals a Back the browser
 *   owes to the previous site.
 * - **popstate** (Back/Forward) is authoritative: the sheet state is re-read
 *   from the URL, never guessed. That is what makes Back/Forward and refresh
 *   agree by construction rather than by two code paths staying in sync.
 *
 * Deliberately raw `window.history`, matching the `replaceState` the
 * share-target handler in `TodayMoments` already uses, rather than
 * `router.push`: an App Router navigation re-renders the route and would
 * remount the sheet's own state on every open and close.
 */

export type { SheetValue };

export function parseSheetParam(value: string | null): SheetValue | null {
  return isSheetValue(value) ? value : null;
}

/** Current URL with `sheet` set to `sheet`, or removed when null. */
export function urlWithSheet(
  location: { pathname: string; search: string },
  sheet: SheetValue | null,
): string {
  const params = new URLSearchParams(location.search);
  if (sheet) {
    params.set("sheet", sheet);
  } else {
    params.delete("sheet");
  }
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}`;
}

export interface SheetUrlState {
  activeSheet: SheetValue | null;
  /** Opens a sheet AND records it in the URL (pushes a history entry). */
  openSheet(sheet: SheetValue): void;
  /** Closes whatever is open and returns the URL to where it was. */
  closeSheet(): void;
  /**
   * Applies a sheet the URL ALREADY carries (the mount-time deep link). Writes
   * no history: the entry that named the sheet is the one we are standing on.
   */
  adoptSheetFromUrl(sheet: SheetValue): void;
}

export function useSheetUrlState(): SheetUrlState {
  const [activeSheet, setActiveSheet] = useState<SheetValue | null>(null);

  // True only while the currently-open sheet is one WE pushed — the single
  // fact that decides whether closing may consume a Back.
  const pushedRef = useRef(false);

  useEffect(() => {
    function handlePopState() {
      // Back/Forward: the URL wins. Whatever entry we land on, we did not
      // push it in this transition, so closing from here must not pop.
      pushedRef.current = false;
      setActiveSheet(
        parseSheetParam(
          new URLSearchParams(window.location.search).get("sheet"),
        ),
      );
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openSheet = useCallback((sheet: SheetValue) => {
    setActiveSheet(sheet);
    if (typeof window === "undefined") return;
    // Already on this sheet's URL (e.g. re-opening after a deep link): keep
    // the stack flat rather than stacking an identical entry.
    if (
      parseSheetParam(
        new URLSearchParams(window.location.search).get("sheet"),
      ) === sheet
    ) {
      return;
    }
    window.history.pushState(null, "", urlWithSheet(window.location, sheet));
    pushedRef.current = true;
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
    if (typeof window === "undefined") return;
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", urlWithSheet(window.location, null));
  }, []);

  const adoptSheetFromUrl = useCallback((sheet: SheetValue) => {
    pushedRef.current = false;
    setActiveSheet(sheet);
  }, []);

  return { activeSheet, openSheet, closeSheet, adoptSheetFromUrl };
}
