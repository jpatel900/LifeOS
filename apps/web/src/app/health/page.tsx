import { CockpitRoute } from "../components/CockpitRoute";

// #687 C2-S4: still NOT redirected — same reason, and same shape, as
// `/calendar` after C2-S2. Every capability this screen carried now lives on
// the moments home's Health surface (`?sheet=health`): the system check and its
// `health_checks` write, the glance verdict, all three check groups with their
// plain-language names, the sign-in doors on signed-out rows, People &
// commitments, the five FR-047 Mirror gauges, and the developer disclosure.
// What keeps this route alive is sequencing, not capability: C2-S6 retires the
// legacy shell in one piece, behind the rollback flag, with the gated cockpit
// e2e specs re-anchored in the same change.
//
// NOTE for S6: `moments/HealthSheet.tsx` imports `HEALTH_GROUPS` /
// `HEALTH_CHECK_PRESENTATION` from `cockpit/HealthView.tsx` and `MirrorPanel`
// from `cockpit/MirrorPanel.tsx`, deliberately — one presentation map, kept
// honest by `src/__tests__/healthPage.test.tsx`'s coverage assertion. Retiring
// the cockpit means MOVING those two modules, not deleting them.
export default function HealthPage() {
  return <CockpitRoute stage="health" />;
}
