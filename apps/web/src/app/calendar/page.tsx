import { CockpitRoute } from "../components/CockpitRoute";

// #687 C2-S2: still NOT redirected — but the reason has changed, and the old
// one is no longer true. This route used to be the ONLY home of the hour-rail
// placement UI, unplan, proposal accept/reject/nudge and Google Calendar
// approval, so redirecting would have silently dropped them. All of that now
// lives on the moments home's Plan surface (`?sheet=plan`), driven against the
// same writes. What keeps this route alive is sequencing, not capability: C2-S6
// retires the legacy shell in one piece, behind the rollback flag, with the
// gated cockpit e2e specs re-anchored in the same change.
//
// NOTE for S6: FINDING 1 (the hour rail's "Drop here" over a tap it silently
// ignores) is fixed on the ported surface only. `PlanView.tsx:227-231` still
// carries it. The FINDING 3/4 count fixes are in `lib/cockpit/viewModel.ts`,
// which this route does read, so those landed on both screens.
export default function CalendarPage() {
  return <CockpitRoute stage="plan" />;
}
