import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687: redirect to the moments home with the capture overlay open. The
// cockpit capture stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): carries the incoming
// query string through to the moments home, composed with this shim's own
// `capture=1` — see that file's header comment for the full collision rule.
export default async function CapturePage({
  searchParams,
}: {
  searchParams?: Promise<LegacyIncomingSearchParams>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    redirect(legacyRedirectTarget(params, { capture: "1" }));
  }
  return <CockpitRoute stage="capture" />;
}
