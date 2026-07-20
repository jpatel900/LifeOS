import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687: redirect to the moments home in the Flow moment. The cockpit execute
// stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function ExecutePage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?moment=flow");
  }
  return <CockpitRoute stage="execute" />;
}
