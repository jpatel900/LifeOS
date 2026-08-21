import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687 C2-S10 (round-4 fresh-eyes judge): every OTHER sheet/moment this app
// has a command-palette "Open X" action for also has a same-named direct
// route redirecting into the moments home — `/triage`, `/execute`,
// `/review`, `/health`, `/capture`, `/today` — except Plan, which only had
// its LEGACY stage name, `/calendar` (kept as-is, old bookmarks still work —
// see that file's own comment). `/plan` joins the pattern: same redirect
// target as `/calendar`, same rollback branch.
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): carries the incoming
// query string through, composed with this shim's own `sheet=plan` — this
// is the exact route the judge's own repro named
// (`/plan?area=area-personal` used to land on Main Job).
export default async function PlanPage({
  searchParams,
}: {
  searchParams?: Promise<LegacyIncomingSearchParams>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    redirect(legacyRedirectTarget(params, { sheet: "plan" }));
  }
  return <CockpitRoute stage="plan" />;
}
