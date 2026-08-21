import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687 C2-S6: redirect to the moments home with the Plan sheet open. Every
// capability this route carried (hour rail, unplan, proposals, recalibration,
// Google Calendar approval) already lives on `?sheet=plan` (PlanSheet.tsx) —
// see C2-S2 (#809) and the C2-S6 lane contract. The cockpit calendar stage
// stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): carries the incoming
// query string through, composed with this shim's own `sheet=plan` — see
// that file's header comment for the full collision rule.
export default async function CalendarPage({
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
