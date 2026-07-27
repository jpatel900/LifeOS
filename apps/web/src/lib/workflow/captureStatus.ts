// Final UX Loop C1, Target Cards 1 + 4 (audit P0#3) — one definition of
// "this thought has not been sorted yet", used by every surface that says so.
//
// ## Why this module exists
//
// Before it, six surfaces each re-derived "unsorted" from the capture's status
// alone (`UnsortedCaptures`, `TriageSheet`'s count, three derivations in
// `momentsViewModel/start.ts`, `reEntry/summary.ts`, plus `pipelineCounts`'
// Capture badge). Status alone is not enough: the audit
// (`docs/design/ux-audit-2026-07-26-fable.md`, P0#3) found the same two items
// listed as `Captured, not sorted yet` with a `Sort` button while the Start
// moment offered them as accepted tasks with `Start now`, and the hero read
// `2 thoughts waiting for a decision.` about decisions already made.
//
// The root cause was a missing write (see `resolveCaptureItems` in
// `lib/data/workflow/capture.ts` — the accept path never advanced
// `capture_items.status`). Fixing the write makes new work truthful. This
// module is the second half: a cross-table invariant that holds even when the
// stored status is stale — a capture an accepted task already points at is
// NEVER unsorted, whatever its status column says. That covers rows written
// before the fix without touching anyone's data.
//
// Target Card 4: "one item = one truth: never simultaneously 'unsorted' and an
// accepted task anywhere in the app." "Anywhere" is why every call site routes
// through here instead of keeping its own filter.
import type { Phase2CaptureItem } from "@lifeos/schemas";
import type { WorkflowState } from "./shared";

/**
 * The capture statuses that can still be waiting for a sort.
 *
 * `triage_required` is included because a sorted capture keeps that status
 * while its draft sits in the pending list — the draft check below, not the
 * status, is what moves the row out of the unsorted list on a successful sort.
 */
export const UNSORTED_CAPTURE_STATUSES = ["new", "triage_required"] as const;

/**
 * The statuses a capture may be advanced FROM when its draft is accepted.
 *
 * Mirrors the `COMPOST_ELIGIBLE_SOURCE_STATUSES` idiom: the persistence layer
 * (`resolveCaptureItems`) reuses this exact list as its DB-level write guard,
 * so "which rows may still move to resolved" has one definition rather than a
 * duplicated literal list. Deliberately excludes `resolved`, `archived` and
 * `composted` — those already moved on, and a late or replayed accept must not
 * drag them backwards.
 */
export const RESOLVABLE_CAPTURE_SOURCE_STATUSES = [
  "new",
  "parsed",
  "triage_required",
] as const;

const UNSORTED_STATUS_SET = new Set<string>(UNSORTED_CAPTURE_STATUSES);

/**
 * Has this capture already been through triage?
 *
 * True when EITHER a task draft points at it (it has been sorted — the draft is
 * the decision now waiting) OR a task points at it (it was accepted, and that
 * task is the thought's one truth). Both are checked because they fail in
 * opposite directions: drafts are device-local and vanish on a fresh session,
 * tasks are persisted and are exactly what survives to contradict a stale
 * capture status.
 */
export function captureHasTriageDecision(
  state: WorkflowState,
  captureId: string,
): boolean {
  return (
    state.taskDrafts.some((draft) => draft.capture_item_id === captureId) ||
    state.tasks.some((task) => task.source_capture_item_id === captureId)
  );
}

/**
 * Every capture that is genuinely still waiting to be sorted, oldest-first
 * ordering left to the caller (state order is preserved).
 *
 * @param areaId scope to one area, or null for "everything".
 */
export function selectUnsortedCaptures(
  state: WorkflowState,
  areaId: string | null = null,
): Phase2CaptureItem[] {
  return state.captureItems.filter(
    (item) =>
      UNSORTED_STATUS_SET.has(item.status) &&
      !captureHasTriageDecision(state, item.id) &&
      (areaId ? item.area_id === areaId : true),
  );
}

/** Count form of {@link selectUnsortedCaptures}, for badges and hero copy. */
export function countUnsortedCaptures(
  state: WorkflowState,
  areaId: string | null = null,
): number {
  return selectUnsortedCaptures(state, areaId).length;
}
