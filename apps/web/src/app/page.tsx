import { CockpitRoute } from "./components/CockpitRoute";
import { TodayMoments } from "./components/moments/TodayMoments";
import { isMomentsHomeEnabled } from "@/lib/flags";

// Moments pass P7a — `/` renders the assembled moments home only when the
// build-time NEXT_PUBLIC_MOMENTS_HOME flag is on (default OFF keeps the
// seven-stage cockpit today grid, so the existing stage-chrome E2E specs stay
// green until the intentional flip). The demoted stage routes remain live.
//
// Layout fix (post-go-live defect): unlike CockpitRoute -> LifeOSCockpit,
// TodayMoments renders no page shell of its own — it is a bare content grid.
// Mounted directly under AppShell (which only adds chrome for /settings),
// that left the moments home flush against the viewport edge with no
// max-width, causing horizontal overflow from the two-column
// content+side-rail grids inside StartMoment/CloseMoment. Reuse the exact
// centered/padded/max-width container LifeOSCockpit uses (`.lifeos-cockpit`
// scope for the --max/--sf/... tokens, same Tailwind classes for the
// centering/padding) so the moments home gets the same page shell as the
// cockpit routes, without touching TodayMoments' own markup or the
// dev-only /moments-preview route (which has its own wrapper).
function MomentsHomeShell() {
  return (
    <main className="lifeos-cockpit" data-testid="moments-home-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--max)] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
        <TodayMoments />
      </div>
    </main>
  );
}

export default function HomePage() {
  if (isMomentsHomeEnabled()) {
    return <MomentsHomeShell />;
  }
  return <CockpitRoute stage="today" />;
}
