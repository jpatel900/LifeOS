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
