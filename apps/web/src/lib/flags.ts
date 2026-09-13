/**
 * Moments pass P7 — the flip mechanism (build-time flag).
 *
 * `NEXT_PUBLIC_MOMENTS_HOME` gates whether `/` renders the assembled moments
 * home (TodayMoments) instead of the seven-stage cockpit today grid. It is a
 * BUILD-TIME flag (ADR 0003 R1): `NEXT_PUBLIC_*` is inlined by Next at build,
 * so the home is an env change + redeploy, revertible without a code revert.
 *
 * P7d (go-live): default is now ON — the moments home is the live `/`. Set
 * `NEXT_PUBLIC_MOMENTS_HOME=false` (e.g. a Vercel env var) to fall back to the
 * seven-stage cockpit today grid with no code change. The demoted stage routes
 * (/capture, /triage, ...) stay live either way.
 */
export function isMomentsHomeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOMENTS_HOME !== "false";
}

/**
 * Owner decision 2026-08-30 (judge environment, #687) — a first visit to the
 * demo (unconfigured Supabase) fallback should show a realistic sample
 * instead of an empty shell, so a fresh-eyes judge who only ever reaches
 * demo mode scores a populated app.
 *
 * Same on/off idiom as `isMomentsHomeEnabled` above: default ON, an explicit
 * "false" opts out. `src/setupTests.ts` sets it to "false" for the whole
 * vitest suite — hundreds of existing tests render a fresh `WorkflowProvider`
 * and assert on the pre-existing empty initial state (measured: flipping the
 * default on broke 23 test files). New coverage for the seeded state opts
 * back in per-test the same way `routeSmoke.test.tsx` already pins
 * `NEXT_PUBLIC_MOMENTS_HOME` per describe block.
 *
 * Only ever consulted when `!isSupabaseConfigured()` — a configured deploy
 * never shows sample rows, not even briefly before the account load lands.
 */
export function isDemoSeedEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_SEED !== "false";
}
