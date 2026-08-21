import { cookies } from "next/headers";
import { CockpitRoute } from "./components/CockpitRoute";
import { MomentsThemeShell } from "./components/moments/MomentsThemeShell";
import { TodayMoments } from "./components/moments/TodayMoments";
import {
  deepLinkTargetFromParams,
  type DeepLinkTarget,
} from "./components/moments/deepLink";
import { isMomentsHomeEnabled } from "@/lib/flags";
import {
  MOMENTS_PREFS_COOKIE_NAME,
  parseMomentsPrefsCookie,
} from "@/lib/momentsPreferencesCookie";
import type { MomentValue } from "./components/moments/MomentSwitcher";

// `/` renders the moments home only when the build-time
// NEXT_PUBLIC_MOMENTS_HOME flag is on (default is ON since P7d go-live —
// setting it to "false" is the rollback lever that keeps the seven-stage
// cockpit today grid live; flag is ADR 0003 R1's documented rollback, do not
// retire without owner change-control, see issue #590). The demoted stage
// routes remain live either way.
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
function MomentsHomeShell({
  deepLink,
  cookieMoment,
}: {
  deepLink: DeepLinkTarget;
  cookieMoment: MomentValue | undefined;
}) {
  return (
    <MomentsThemeShell>
      <TodayMoments deepLink={deepLink} cookieMoment={cookieMoment} />
    </MomentsThemeShell>
  );
}

// #687: the demoted stage routes redirect here carrying the target as query
// params (e.g. `/triage` -> `/?sheet=triage`), so `/` opens the matching
// moment/sheet/overlay. searchParams is a promise in Next 15's App Router.
//
// C2-S14 (#687 round-8, defect 1 — the worst one): `cookies()` is read HERE,
// not in `app/layout.tsx`, deliberately. `/` already reads `searchParams`,
// which forces this route dynamic regardless — reading `cookies()` here adds
// no NEW caching cost. Reading it in the root layout instead (so
// `WorkflowProvider`'s `selectedAreaId` could resolve the area chip
// truthfully too) would force EVERY route dynamic, including the 8 demoted
// redirect shims, `/login`, and `/settings/areas` — 11 routes that render no
// area-scoped content at all. See `lib/momentsPreferencesCookie.ts`'s header
// for the full trade-off and the `pnpm build` route-table evidence.
export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isMomentsHomeEnabled()) {
    const params = searchParams ? await searchParams : undefined;
    const cookieStore = await cookies();
    const cookiePrefs = parseMomentsPrefsCookie(
      cookieStore.get(MOMENTS_PREFS_COOKIE_NAME)?.value,
    );
    return (
      <MomentsHomeShell
        deepLink={deepLinkTargetFromParams(params)}
        cookieMoment={cookiePrefs?.moment}
      />
    );
  }
  return <CockpitRoute stage="today" />;
}
