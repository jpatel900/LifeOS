import { CockpitRoute } from "../components/CockpitRoute";

// #687 OWNER-GATE: NOT redirected. The moments Close moment covers day-close
// (wins, rollups, carry-forward) but ReviewView's planned-vs-actual, needs
// recovery, aging waiting-on, open commitments, and policy proposals exist
// ONLY here. Redirecting would silently drop those features; the owner
// decides port/keep/drop first.
export default function ReviewPage() {
  return <CockpitRoute stage="review" />;
}
