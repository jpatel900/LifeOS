import { redirect } from "next/navigation";
import { CockpitRoute } from "../components/CockpitRoute";
import { isMomentsHomeEnabled } from "@/lib/flags";

// #687 C2-S10 (round-4 fresh-eyes judge): every OTHER sheet/moment this app
// has a command-palette "Open X" action for also has a same-named direct
// route redirecting into the moments home — `/triage`, `/execute`,
// `/review`, `/health`, `/capture`, `/today` — except Plan, which only had
// its LEGACY stage name, `/calendar` (kept as-is, old bookmarks still work —
// see that file's own comment). `/plan` joins the pattern: same redirect
// target as `/calendar`, same rollback branch.
export default function PlanPage() {
  if (isMomentsHomeEnabled()) {
    redirect("/?sheet=plan");
  }
  return <CockpitRoute stage="plan" />;
}
