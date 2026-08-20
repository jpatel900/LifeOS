import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687 C2-S6: redirect to the moments home with the Plan sheet open. Every
// capability this route carried (hour rail, unplan, proposals, recalibration,
// Google Calendar approval) already lives on `?sheet=plan` (PlanSheet.tsx) —
// see C2-S2 (#809) and the C2-S6 lane contract. The cockpit calendar stage
// stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function CalendarPage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?sheet=plan");
  }
  return <CockpitRoute stage="plan" />;
}
