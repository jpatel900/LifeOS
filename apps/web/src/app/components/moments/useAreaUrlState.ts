"use client";

import { useCallback, useEffect, useRef } from "react";
import { parseAreaParam, urlWithArea } from "@/lib/areaUrlParam";
import { historyPushState } from "@/lib/rawHistory";

export {
  ALL_AREAS_PARAM_VALUE,
  parseAreaParam,
  urlWithArea,
} from "@/lib/areaUrlParam";

/**
 * C2-S8 (#687 finding 1) — the `useMomentUrlState`-shaped hook for the
 * masthead's area switcher: "switching the active area changes app-wide
 * content with zero URL trace, persists across reload invisibly, and Back
 * can't undo it."
 *
 * Unlike `moment`/`sheet`/`overlay`, `selectedAreaId` is not local UI state
 * this hook owns — it lives in `WorkflowContext` (shared by the moments home
 * AND the legacy stage-cockpit fallback, `LifeOSCockpit.tsx`, behind the
 * `NEXT_PUBLIC_MOMENTS_HOME` rollback flag). So this hook does NOT resolve
 * the initial value, self-heal the URL at mount, or reconcile an async area
 * sync — `lib/WorkflowContext.tsx` owns all three (see its own C2-S8
 * comments on the `selectedAreaId` initializer, the hydrate mount effect,
 * `applyPersistedAreas`, and the `hasHydratedFromStorage`-gated persist
 * effect that keeps `?area=` truthful for every reason the selection can
 * change). Putting that resolution in the CHILD component instead of the
 * ANCESTOR that actually owns the state would race it: React fires child
 * effects before parent effects on mount, so a same-purpose effect here
 * would run — and could write to the URL — before WorkflowContext's own
 * mount effect has resolved anything at all.
 *
 * What this hook DOES own, matching every other URL-visible piece of
 * moments state: the OUTBOUND write on a user-initiated switch (`setArea`,
 * `pushState` — every switch is a forward step, same as `useMomentUrlState`,
 * no "closed" state to return to), and popstate authority (Back/Forward
 * re-reads the URL, never guesses).
 */

export interface AreaUrlState {
  /** Switches area AND records it in the URL (pushes a history entry). */
  setArea(areaId: string | null): void;
}

export function useAreaUrlState(
  setSelectedAreaId: (areaId: string | null) => void,
  areas: readonly { id: string }[],
): AreaUrlState {
  // Always the latest area list, for the popstate handler below — a plain
  // effect dependency would mean re-attaching the listener on every areas
  // change, which is harmless but pointless churn; a ref reads the current
  // value without that.
  const areasRef = useRef(areas);
  useEffect(() => {
    areasRef.current = areas;
  }, [areas]);

  useEffect(() => {
    function handlePopState() {
      const fromUrl = parseAreaParam(
        new URLSearchParams(window.location.search).get("area"),
      );
      // `undefined` (a pre-feature entry with no `?area=` of its own) and
      // the "all" sentinel both resolve to `null` — always a valid
      // selection, needing no area-list lookup. A named id that no longer
      // exists in the live list (Back landing on an entry from before an
      // area was renamed/removed) ALSO resolves to `null` rather than being
      // trusted blindly — unlike a sheet's static validity check, an area
      // id's validity is genuinely dynamic, so popstate re-validates it the
      // same way the mount-time scrub does, rather than rendering a ghost
      // selection. WorkflowContext's own URL-sync effect (gated on
      // `hasHydratedFromStorage`) corrects the address bar to match
      // whenever this lands on `null` for a named-but-unknown id — no
      // `replaceState` needed here too.
      const resolved =
        fromUrl == null
          ? null
          : areasRef.current.some((area) => area.id === fromUrl)
            ? fromUrl
            : null;
      setSelectedAreaId(resolved);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setSelectedAreaId]);

  const setArea = useCallback(
    (areaId: string | null) => {
      setSelectedAreaId(areaId);
      if (typeof window === "undefined") return;
      const current = parseAreaParam(
        new URLSearchParams(window.location.search).get("area"),
      );
      if (current === areaId) return;
      historyPushState(urlWithArea(window.location, areaId));
    },
    [setSelectedAreaId],
  );

  return { setArea };
}
