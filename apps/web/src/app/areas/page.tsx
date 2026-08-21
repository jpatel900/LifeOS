import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687 C2-S6: redirect to the moments home with the Areas sheet open. Every
// capability this route carried already lives on `?sheet=areas`
// (AreasSheet.tsx) — see C2-S5 (#851) and the C2-S6 lane contract. The
// cockpit all-areas-overview stage stays reachable only under the #590
// rollback (NEXT_PUBLIC_MOMENTS_HOME=false).
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): carries the incoming
// query string through, composed with this shim's own `sheet=areas` — see
// that file's header comment for the full collision rule.
export default async function AreasOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<LegacyIncomingSearchParams>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    redirect(legacyRedirectTarget(params, { sheet: "areas" }));
  }
  return <CockpitRoute stage="overview" />;
}
