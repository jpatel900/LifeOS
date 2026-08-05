import { CockpitRoute } from "../components/CockpitRoute";

// #687 OWNER-GATE: NOT redirected. The moments plan sheet is a thin schedule
// summary — the hour-rail placement UI, unplan, proposal accept/reject/nudge,
// and Google Calendar approval exist ONLY here (PlanView). Redirecting would
// silently drop those features; the owner decides port/keep/drop first.
export default function CalendarPage() {
  return <CockpitRoute stage="plan" />;
}
