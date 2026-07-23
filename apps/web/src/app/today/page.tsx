import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687: `/today` is the moments home itself. When the moments home is live
// (default), redirect to it; the raw cockpit today grid stays reachable only
// under the #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function TodayPage() {
  if (isMomentsHomeEnabled()) {
    redirect("/");
  }
  return <CockpitRoute stage="today" />;
}
