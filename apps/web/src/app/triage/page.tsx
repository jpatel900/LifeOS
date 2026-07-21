import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687: redirect to the moments home with the triage sheet open. The cockpit
// triage stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function TriagePage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?sheet=triage");
  }
  return <CockpitRoute stage="triage" />;
}
