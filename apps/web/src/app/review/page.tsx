import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  legacyRedirectTarget,
  type LegacyIncomingSearchParams,
} from "../legacyRedirectTarget";

// #687 C2-S6: redirect to the moments home with the Review sheet open — NOT
// `?moment=close` (the Close moment is deliberately day-scoped and lacks
// planned-vs-actual, needs-a-decision, aging waiting-on, open commitments and
// policy proposals on purpose; see ReviewSheet.tsx's own header comment).
// ReviewSheet.tsx (C2-S3, #809) ports every capability this route carried,
// including the "Needs recovery" queue (now "Needs a decision" —
// `review-sheet-decision-*` testids: carry forward / put off / drop). The
// cockpit review stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
//
// #687 round-8 finding 2 (legacyRedirectTarget.ts): carries the incoming
// query string through, composed with this shim's own `sheet=review` — see
// that file's header comment for the full collision rule.
export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: Promise<LegacyIncomingSearchParams>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    redirect(legacyRedirectTarget(params, { sheet: "review" }));
  }
  return <CockpitRoute stage="review" />;
}
