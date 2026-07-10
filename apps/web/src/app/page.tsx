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
//
// #477: CaptureAffordance floats `fixed bottom-6` with a footprint of
// ~94px from the viewport's bottom edge (its own rendered height, up to
// ~70px once "Capture a thought" wraps to two lines at narrow widths,
// plus the 24px bottom-6 offset) — unaffected by scroll, since `fixed`
// pins it to the viewport, not the document. On a short page (e.g. the
// Start moment's empty state) the last content row — the Pipeline
// disclosure — sits at the natural end of the flow, which on scroll
// lands directly under the pill with no shell-level clearance reserved
// for it. `pb-32` (128px) reserves comfortably more than that footprint
// so the last row always clears the pill regardless of content height,
// at any width (the pill's size/position don't change per breakpoint,
// so this isn't a `sm:` variant like the surrounding px/pt).
//
// D-1 (issue #483): `moments-home` (globals.css) layers the prototype's
// subtle radial accent tint behind `.lifeos-cockpit`'s flat `--bd`
// background — depth for this shell only, the cockpit stage routes keep
// their plain background untouched.
function MomentsHomeShell() {
  return (
    <main
      className="lifeos-cockpit moments-home"
      data-testid="moments-home-shell"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--max)] flex-col gap-5 px-4 pb-32 pt-4 sm:px-6 sm:pt-6">
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
