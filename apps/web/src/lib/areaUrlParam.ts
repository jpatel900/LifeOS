/**
 * C2-S8 (#687 finding 1): the `?area=` query param contract, shared between
 * `WorkflowContext.tsx`'s mount-time precedence resolution (URL outranks the
 * stored device preference) and the moments UI's outbound push/pop wiring
 * (`moments/useAreaUrlState.ts`). One parser, one sentinel, used by both ends
 * of the same URL — framework-free so `lib/WorkflowContext.tsx` does not need
 * to depend on the moments UI layer to read it.
 *
 * Area ids are account-scoped, mostly-opaque strings, not a fresh invention
 * for this param: `workflowAreaIdForPersistedArea` (workflowAreaMapping.ts)
 * already resolves the four legacy seed areas to readable ids ("area-main-job",
 * "area-personal", ...) and falls back to the raw DB uuid for anything else.
 * There is no separate human-readable "slug" surfaced to the client beyond
 * that existing mapping (`Phase2MockArea` — the shape `selectedAreaId` and
 * every consumer of `state.areas` actually uses — carries no `slug` field;
 * only the DB-level `Area` schema does, and it is deliberately dropped when
 * `applyPersistedAreas` builds the client-side list). So the URL carries
 * whatever `selectedAreaId` already is: truthful, not invented, no schema
 * change.
 *
 * "All areas" has no id of its own (`selectedAreaId === null`), so it needs
 * an explicit sentinel string in the URL rather than an absent param, which
 * already means something else here: "no opinion, defer to whatever tier
 * the caller's own precedence resolves next" — matching the three-valued
 * read `loadStoredSelectedAreaId` (workflowContext/reducerCore.ts) already
 * uses for the same distinction at the device-storage tier.
 */

export const ALL_AREAS_PARAM_VALUE = "all";

/**
 * `undefined` = param absent (defer to the caller's own next precedence tier).
 * `null` = the "all" sentinel (explicit All-areas choice).
 * `string` = a candidate area id; the caller must validate it against the
 * live area list before applying it — this parser only decodes the URL's
 * shape, it has no area list to check against.
 */
export function parseAreaParam(
  value: string | null,
): string | null | undefined {
  if (value === null) return undefined;
  if (value === ALL_AREAS_PARAM_VALUE) return null;
  return value;
}

/** Current URL with `area` set to encode `areaId` (`null` -> the "all" sentinel). */
export function urlWithArea(
  location: { pathname: string; search: string },
  areaId: string | null,
): string {
  const params = new URLSearchParams(location.search);
  params.set("area", areaId === null ? ALL_AREAS_PARAM_VALUE : areaId);
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}`;
}

/**
 * True only on the moments home's own URL (`/`) — the one route `?area=`
 * means anything on. `WorkflowProvider` (`lib/WorkflowContext.tsx`) mounts
 * once in the root layout, so it renders on EVERY route (`/login`,
 * `/settings/areas`, and, under the `NEXT_PUBLIC_MOMENTS_HOME=false`
 * rollback, the legacy cockpit's own stage routes) — unlike
 * `moment`/`sheet`/`overlay`, whose read/write mechanisms live entirely
 * inside `TodayMoments.tsx` and so can never run anywhere else by
 * construction. Every demoted stage route (`/today`, `/capture`, ...)
 * server-redirects into `/` before any client code runs (deepLink.ts's own
 * contract), so by the time this ever executes client-side, a real moments
 * visit has already landed on `/` — checking the pathname, not a route
 * allowlist, is enough.
 */
export function isMomentsHomePathname(
  pathname: string = typeof window === "undefined"
    ? ""
    : window.location.pathname,
): boolean {
  return pathname === "/";
}
