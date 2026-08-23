import { redirect } from "next/navigation";

// #687 (round-6 fresh-eyes judge, finding: /settings 404s): `/settings/areas`
// is the ONLY settings surface today — charters, operator profile, Google
// Calendar admin, data export, onboarding rerun, and local reset are all
// disclosures INSIDE that one page (`AreasSettingsPage`), not separate routes
// (see `routeAllowlist.test.ts`'s own header comment, which already called
// `/settings/areas` the sole "owner-ratified keep" settings route). A landing
// page here would have nothing of its own to show; a redirect, following the
// same shim pattern the demoted stage routes use (see
// `legacyRouteRedirects.test.tsx`), is the smaller, honest fix.
//
// Unlike those routes, this redirect is NOT gated behind
// `NEXT_PUBLIC_MOMENTS_HOME` and has no `CockpitStage` fallback: `/settings`
// never had a legacy cockpit-stage equivalent (settings predates the
// moments-vs-cockpit split entirely), and `/settings/areas` is reachable
// identically on both sides of that flag — there is no rollback state to
// preserve here.
export default function SettingsPage() {
  redirect("/settings/areas");
}
