import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687: `/today` is the moments home itself. When the moments home is live
// (default), redirect to it; the raw cockpit today grid stays reachable only
// under the #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false).
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): this shim owns no param
// of its own (its target was always bare `/`), so it simply carries the
// incoming query string straight through (scrubbed of unknown keys) — e.g.
// `/today?area=area-personal` -> `/?area=area-personal` instead of dropping
// the area on the floor.
export default async function TodayPage({
  searchParams,
}: {
  searchParams?: Promise<LegacyIncomingSearchParams>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    redirect(legacyRedirectTarget(params));
  }
  return <CockpitRoute stage="today" />;
}
