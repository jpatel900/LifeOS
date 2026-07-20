import { CockpitRoute } from "./components/CockpitRoute";
import { MomentsThemeShell } from "./components/moments/MomentsThemeShell";
import { TodayMoments } from "./components/moments/TodayMoments";
import { isMomentsHomeEnabled } from "@/lib/flags";

// `/` renders the moments home only when the build-time
// NEXT_PUBLIC_MOMENTS_HOME flag is on (default OFF keeps the seven-stage
// cockpit today grid live; flag is ADR 0003 R1's documented rollback lever —
// do not retire without owner change-control, see issue #590). The demoted
// stage routes remain live either way.
//
// Reuses LifeOSCockpit's centered/padded/max-width `.lifeos-cockpit` shell
// (TodayMoments itself renders no page shell) so the moments home doesn't
// overflow horizontally the way a bare AppShell mount would.
//
// #477/#553 constraint: CaptureAffordance is a viewport-`fixed` pill: the
// shell's bottom padding must reserve enough clearance that the pill never
// covers the last content row (Pipeline rail / Areas card) once scrolled to
// the true end of the page. This is a scroll-position guarantee only — the
// pill can still transiently sit over content at other scroll offsets; see
// tests/e2e/moments-home-parity.spec.ts for the e2e guard and tradeoff note.
//
// D-1 (#483): `moments-home` (globals.css) adds a subtle radial accent tint
// behind this shell only; cockpit stage routes stay plain.
//
// #501: `data-theme` follows the app's next-themes theme (see
// MomentsThemeShell) rather than staying permanently unset.
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
