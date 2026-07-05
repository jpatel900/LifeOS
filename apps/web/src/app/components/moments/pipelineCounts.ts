import type { WorkflowState } from "@/lib/workflow";
import {
  buildCockpitViewModel,
  PIPELINE_STAGES,
} from "@/lib/cockpit/viewModel";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 *
 * Pure, presentation-only derivation of per-stage pipeline counts for the
 * Start moment's collapsed Pipeline disclosure. Deliberately reuses
 * `buildCockpitViewModel` from `@/lib/cockpit/viewModel` rather than
 * re-deriving the counts by hand: the cockpit's `review` badge is
 * `reviewQueue.length + sessions.length`, where `reviewQueue` is a
 * multi-source dedup across execution sessions, missed blocks, and blocked
 * tasks (~65 lines). A hand-copied reimplementation would silently drift
 * from the real nav badges the first time either derivation changes: six
 * concurrent packets are touching this repo, so drift risk is not
 * theoretical. Reusing the lib function keeps this helper byte-for-byte in
 * sync with what LifeOSCockpit's nav badges actually show, at the cost of a
 * "replicate the derivation" ask being satisfied via composition instead of
 * copy — the equality is verified in pipelineCounts.test.ts against
 * `buildCockpitViewModel(...).counts` directly.
 *
 * This only *imports* from `@/lib/cockpit/viewModel` (already imported
 * throughout the app, including by LifeOSCockpit itself) — it does not
 * import from or edit the LifeOSCockpit component, and it does not touch
 * any file under `lib/**`.
 *
 * Excludes the "today" pseudo-stage: PipelineOverview renders the five
 * workflow steps (capture/triage/plan/execute/review), matching the task's
 * ground-truth stage set. `selectedAreaId: null` mirrors the cockpit's own
 * fallback (`activeArea ?? areas[0]`) for an "All areas" selection — the
 * same semantics the nav badges use today.
 */

export const PIPELINE_OVERVIEW_STAGES = PIPELINE_STAGES.filter(
  (stage): stage is Exclude<(typeof PIPELINE_STAGES)[number], "today"> =>
    stage !== "today",
);

export type PipelineOverviewStage = (typeof PIPELINE_OVERVIEW_STAGES)[number];

export function buildPipelineCounts(
  state: WorkflowState,
  selectedAreaId: string | null = null,
): Record<PipelineOverviewStage, number> {
  const { counts } = buildCockpitViewModel(state, selectedAreaId, false);
  return {
    capture: counts.capture,
    triage: counts.triage,
    plan: counts.plan,
    execute: counts.execute,
    review: counts.review,
  };
}
