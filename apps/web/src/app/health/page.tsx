import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687 C2-S6: redirect to the moments home with the Health sheet open. Every
// capability this route carried already lives on `?sheet=health`
// (HealthSheet.tsx) — see C2-S4 (#846) and the C2-S6 lane contract.
// HealthSheet.tsx deliberately still imports `HEALTH_GROUPS` /
// `HEALTH_CHECK_PRESENTATION` from `cockpit/HealthView.tsx` and `MirrorPanel`
// from `cockpit/MirrorPanel.tsx` — moving those modules is a separate,
// owner-gated follow-up, not part of this route retirement. The cockpit
// health stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function HealthPage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?sheet=health");
  }
  return <CockpitRoute stage="health" />;
}
