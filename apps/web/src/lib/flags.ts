/**
 * Moments pass P7a — packet: the flip mechanism (behind a build-time flag).
 *
 * `NEXT_PUBLIC_MOMENTS_HOME` gates whether `/` renders the assembled moments
 * home (TodayMoments) instead of the seven-stage cockpit today grid. It is a
 * BUILD-TIME flag (ADR 0003 R1): `NEXT_PUBLIC_*` is inlined by Next at build,
 * so flipping the home is an env change + redeploy, revertible without a code
 * revert. Default OFF — an unset/any-other value keeps the stage home, so the
 * existing stage-chrome E2E specs stay green until the intentional flip
 * (P7b/P7c) rewrites them in the same packet that turns this on.
 */
export function isMomentsHomeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOMENTS_HOME === "true";
}
