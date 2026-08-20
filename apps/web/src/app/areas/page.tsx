import { CockpitRoute } from "../components/CockpitRoute";

/**
 * C2-S5 (#687): the All-areas surface now lives in the moments shell at
 * `/?sheet=areas` (`components/moments/AreasSheet.tsx`). This legacy route is
 * deliberately left rendering — comment only, no redirect — exactly as S2, S3
 * and S4 left `/calendar`, `/review` and `/health`. C2-S6 retires all four in
 * one piece behind the rollback flag; doing it here, one route at a time,
 * would mean four separate half-retirements to reason about instead of one.
 *
 * What already changed: `noLegacyRouteLinks.test.ts` now forbids any file
 * under `components/moments/` from navigating here, so nothing in the current
 * surface sends anyone to this page. It survives for old bookmarks until S6.
 */
export default function AreasOverviewPage() {
  return <CockpitRoute stage="overview" />;
}
