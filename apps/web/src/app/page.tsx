import { CockpitRoute } from "./components/CockpitRoute";
import { MomentsThemeShell } from "./components/moments/MomentsThemeShell";
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
// #477: CaptureAffordance floats `fixed bottom-[calc(...)]` with a footprint
// of ~44-70px from the viewport's bottom edge (its own rendered height, plus
// the ~24px safe-area-aware offset — see CaptureAffordance.tsx's #553
// comment) — unaffected by scroll, since `fixed` pins it to the viewport,
// not the document. On a short page (e.g. the Start moment's empty state)
// the last content row — the Pipeline disclosure — sits at the natural end
// of the flow, which on scroll lands directly under the pill with no
// shell-level clearance reserved for it. MomentsThemeShell's bottom padding
// reserves comfortably more than that footprint so the last row always
// clears the pill regardless of content height, at any width (the pill's
// size/position don't change per breakpoint, so this isn't a `sm:` variant
// like the surrounding px/pt).
//
// #553: this guarantee is scoped to the scrolled-to-end position, same as
// #477 established — a viewport-fixed, always-visible pill can transiently
// sit over whatever content occupies its band at other scroll offsets (e.g.
// the Areas card, on the Start moment's default unscrolled load, if the page
// is only slightly taller than the viewport). Eliminating that entirely
// would require either giving up "always available without scrolling" or a
// bigger structural change (bounding this shell to its own internally
// scrolled pane) than this fix's scope — see the tradeoff note on the #553
// e2e guard in tests/e2e/moments-home-parity.spec.ts. What #553 does fix:
// the pill respects the safe-area inset (CaptureAffordance.tsx), and a
// shrink-to-fit centering bug that forced the short mobile label to wrap to
// two lines — inflating the pill's footprint and the terminal clearance it
// needs — is corrected, so the pill is no larger than it needs to be.
//
// D-1 (issue #483): `moments-home` (globals.css) layers the prototype's
// subtle radial accent tint behind `.lifeos-cockpit`'s flat `--bd`
// background — depth for this shell only, the cockpit stage routes keep
// their plain background untouched.
//
// #501: the shell's `data-theme` (which flips `.lifeos-cockpit`'s hex token
// axis to light) must follow the app's next-themes theme rather than staying
// permanently unset — see MomentsThemeShell for the client-side wiring.
function MomentsHomeShell() {
  return (
    <MomentsThemeShell>
      <TodayMoments />
    </MomentsThemeShell>
  );
}

export default function HomePage() {
  if (isMomentsHomeEnabled()) {
    return <MomentsHomeShell />;
  }
  return <CockpitRoute stage="today" />;
}
