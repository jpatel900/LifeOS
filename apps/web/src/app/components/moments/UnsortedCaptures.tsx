"use client";

import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { Button } from "@/components/ui/button";
import { HIT_TARGET_MIN } from "./hitTarget";

/**
 * #703 (owner-ratified 2026-07-19) — the Sort action, shared by every triage
 * surface (the moments TriageSheet and the cockpit TriageView).
 *
 * Capture is now a pure raw save, so this is where a stored thought becomes a
 * task draft. Sort drives the shared `sortCaptureIntoDrafts`, which calls the
 * EXISTING `parseCaptureIntoDrafts` / `/api/parse-capture` path — reused, not
 * reimplemented, so untrusted capture text keeps travelling through the same
 * NS-INV-1 context-assembly authority path and INV-8 delimiting is inherited
 * rather than re-established (proved by `lib/ai/triageSortContainment.test.tsx`).
 *
 * Runs only on a tap: never on mount, never on a timer, never in the
 * background (NFR-001/NFR-005). One sort at a time (FR-026: no parse queue) —
 * but a sort in flight never blocks starting a new capture.
 *
 * Lives here rather than inline in one sheet so both triage surfaces show the
 * same rows, the same copy, and the same degraded behavior.
 */
export function UnsortedCaptures({
  areaId,
  className,
}: {
  /** Scope to one area, or null for "everything". */
  areaId: string | null;
  className?: string;
}) {
  const {
    state,
    captureParse,
    sortCaptureIntoDrafts,
    retryCaptureParseWithMock,
  } = useWorkflow();

  // A sorted capture keeps status "triage_required" while its draft sits in
  // the pending list — exclude any capture a draft already points at
  // (task_drafts.capture_item_id), so a thought is never listed twice and a
  // successful Sort visibly moves the row out of this list.
  const draftedCaptureIds = new Set(
    state.taskDrafts
      .map((draft) => draft.capture_item_id)
      .filter((id): id is string => Boolean(id)),
  );
  const unsortedCaptures = state.captureItems.filter(
    (item) =>
      (item.status === "new" || item.status === "triage_required") &&
      !draftedCaptureIds.has(item.id) &&
      (areaId ? item.area_id === areaId : true),
  );

  // Progress/failure read straight off the shared `captureParse` state the
  // parse path already maintains — no second source of truth, and keyed by
  // capture id so a failure can only ever render on the row it belongs to.
  const sortingCaptureId =
    captureParse.phase === "parsing" ? captureParse.captureId : null;
  const failedSort =
    captureParse.phase === "failed"
      ? {
          captureId: captureParse.captureId,
          message: captureParse.message,
          canRetryWithMock: captureParse.canRetryWithMock,
        }
      : null;

  if (unsortedCaptures.length === 0) return null;

  return (
    <div
      className={cn("grid gap-2", className)}
      data-testid="triage-sheet-captures"
    >
      {/* Glance level first (NFR-006) — what these are, that they are safe,
          and what the one action does. The per-row text is the detail layer;
          the failure explanation is deeper still and only appears when there
          is something to say. */}
      <p className="text-xs font-semibold text-muted-foreground">
        Captured, not sorted yet
      </p>
      <ul className="grid gap-2">
        {unsortedCaptures.map((item) => {
          const area = state.areas.find(
            (candidate) => candidate.id === item.area_id,
          );
          const sorting = sortingCaptureId === item.id;
          const failure = failedSort?.captureId === item.id ? failedSort : null;

          return (
            <li
              key={item.id}
              className="workflow-compact-item grid gap-1.5 rounded-lg border border-border p-3 text-left"
              data-testid={`triage-sheet-capture-${item.id}`}
            >
              <p className="text-sm font-medium">{item.raw_text}</p>
              <p className="text-xs text-muted-foreground">
                {area ? `${area.name} · ` : ""}
                Saved as you wrote it — sorting it into a task is the next step
                here.
              </p>

              {failure ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="grid gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
                  data-testid={`triage-sheet-sort-failed-${item.id}`}
                >
                  {/* Plain language, reassurance first: nothing was lost. The
                      underlying wording is the deep layer, folded away until
                      asked for (NFR-006). */}
                  <p className="font-semibold">
                    Sorting isn&rsquo;t available right now. Your thought is
                    safe here, exactly as you wrote it.
                  </p>
                  <details>
                    <summary className="cursor-pointer font-semibold underline-offset-2 hover:underline">
                      What happened?
                    </summary>
                    <p className="mt-1 font-normal">{failure.message}</p>
                  </details>
                </div>
              ) : null}

              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => sortCaptureIntoDrafts(item.id)}
                  disabled={sortingCaptureId !== null}
                  className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                  data-testid={`triage-sheet-sort-${item.id}`}
                >
                  {sorting ? "Sorting…" : "Sort"}
                </Button>
                {failure?.canRetryWithMock ? (
                  // The degraded choice moved here with the parse it belongs
                  // to: a synchronous, in-band alternative the person
                  // chooses, never a background retry (FR-026).
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => retryCaptureParseWithMock()}
                    disabled={sortingCaptureId !== null}
                    className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                    data-testid={`triage-sheet-sort-basic-${item.id}`}
                  >
                    Sort it the simple way
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
