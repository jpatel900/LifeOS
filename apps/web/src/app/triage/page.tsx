import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687: redirect to the moments home with the triage sheet open. The cockpit
// triage stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): carries the incoming
// query string through, composed with this shim's own `sheet=triage` — see
// that file's header comment for the full collision rule.
export default async function TriagePage({
  searchParams,
}: {
  searchParams?: Promise<LegacyIncomingSearchParams>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    redirect(legacyRedirectTarget(params, { sheet: "triage" }));
  }
  return <CockpitRoute stage="triage" />;
}
