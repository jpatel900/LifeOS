import { CockpitRoute } from "./components/CockpitRoute";
import { TodayMoments } from "./components/moments/TodayMoments";
import { isMomentsHomeEnabled } from "@/lib/flags";

// Moments pass P7a — `/` renders the assembled moments home only when the
// build-time NEXT_PUBLIC_MOMENTS_HOME flag is on (default OFF keeps the
// seven-stage cockpit today grid, so the existing stage-chrome E2E specs stay
// green until the intentional flip). The demoted stage routes remain live.
export default function HomePage() {
  if (isMomentsHomeEnabled()) {
    return <TodayMoments />;
  }
  return <CockpitRoute stage="today" />;
}
