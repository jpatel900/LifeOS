import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687 C2-S6: redirect to the moments home with the Areas sheet open. Every
// capability this route carried already lives on `?sheet=areas`
// (AreasSheet.tsx) — see C2-S5 (#851) and the C2-S6 lane contract. The
// cockpit all-areas-overview stage stays reachable only under the #590
// rollback (NEXT_PUBLIC_MOMENTS_HOME=false).
export default function AreasOverviewPage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?sheet=areas");
  }
  return <CockpitRoute stage="overview" />;
}
