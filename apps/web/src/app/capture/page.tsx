import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687: redirect to the moments home with the capture overlay open. The
// cockpit capture stage stays reachable only under the #590 rollback
// (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function CapturePage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?capture=1");
  }
  return <CockpitRoute stage="capture" />;
}
