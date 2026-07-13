"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { Button } from "@/components/ui/button";
import { MomentSheet } from "./MomentSheet";
import { HIT_TARGET_INVISIBLE, HIT_TARGET_MIN } from "./hitTarget";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 *
 * Thin summary sheet for the Triage stage, opened from the Start moment's
 * Pipeline rail (UX-INV-5: at most 2 interactions from Today — D-3 (#483)
 * made this a single click on the rail's Triage node, since the rail is no
 * longer behind a collapsed disclosure). Lists pending capture drafts,
 * area-scoped the
 * same way the pipeline "Triage" badge counts them
 * (`buildPipelineCounts`/`buildCockpitViewModel`'s `inbox` filter): when no
 * area is selected ("All areas"), both the badge and this list resolve to
 * the first area (`state.areas[0]`), mirroring `buildCockpitViewModel`'s own
 * `activeArea ?? areas[0]` fallback — so the node's count and the sheet's
 * row count always agree, in every area-selection state.
 *
 * U-audit P0-2 (#552): each row now surfaces the parse's substance (area
 * dot + name, task type, first move, estimate range when present) instead
 * of just the raw captured title, and gained a "Do today" primary action.
 * "Do today" wires to `acceptTaskDraft` — the exact same `useWorkflow()`
 * action LifeOSCockpit's `TriageView` wires to `onToday`
 * (`acceptTaskDraft: (draftId) => acceptTaskDraftWithPersistence(draftId,
 * "active")` in WorkflowContext) — no new state transition invented.
 * Accept-to-backlog / reject use the existing `backlogTaskDraft` /
 * `rejectTaskDraft` actions, the same ones TriageView wires to
 * `onBacklog`/`onDrop`. `definition_of_done` is intentionally never
 * rendered here: it lives on the post-accept `Task` row, not on the
 * pre-accept `Phase2TaskDraft` this sheet lists, so "DoD when present" is
 * vacuously satisfied at this stage. Anything beyond this summary
 * (splitting, merging, editing, person-link review) stays in the full
 * Triage stage shell until P7; the "Open full view" link goes to the
 * existing `/triage` route (no new route added).
 */

export interface TriageSheetProps {
  open: boolean;
  selectedAreaId: string | null;
  onClose(): void;
}

export function TriageSheet({
  open,
  selectedAreaId,
  onClose,
}: TriageSheetProps) {
  const { state, acceptTaskDraft, backlogTaskDraft, rejectTaskDraft } =
    useWorkflow();

  // Mirrors buildCockpitViewModel's `activeArea ?? areas[0]` fallback so an
  // "All areas" selection resolves to the same area the pipeline badge used
  // to compute its count.
  const resolvedAreaId = selectedAreaId ?? state.areas[0]?.id ?? null;

  const pendingDrafts = state.taskDrafts.filter(
    (draft) =>
      draft.status === "pending" &&
      (resolvedAreaId ? draft.area_id === resolvedAreaId : true),
  );

  return (
    <MomentSheet open={open} title="Triage" onClose={onClose}>
      {pendingDrafts.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="triage-sheet-empty"
        >
          Nothing waiting in triage — press C to capture the first thing.
        </p>
      ) : (
        <ul className="grid gap-2" data-testid="triage-sheet-list">
          {pendingDrafts.map((draft) => {
            const area = state.areas.find((item) => item.id === draft.area_id);
            const estimateLabel =
              draft.estimated_minutes_low !== null &&
              draft.estimated_minutes_high !== null
                ? `~${draft.estimated_minutes_low}–${draft.estimated_minutes_high}m`
                : null;

            return (
              <li
                key={draft.id}
                className="workflow-compact-item grid gap-2 rounded-lg border border-border p-3"
                data-testid={`triage-sheet-item-${draft.id}`}
              >
                <p className="text-sm font-medium">{draft.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {area ? (
                    <span
                      className="inline-flex items-center gap-1.5"
                      data-testid={`triage-sheet-area-${draft.id}`}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: area.color ?? undefined }}
                      />
                      {area.name}
                    </span>
                  ) : null}
                  {draft.task_type ? (
                    <span data-testid={`triage-sheet-type-${draft.id}`}>
                      {draft.task_type === "decision" ? "Decision" : "Task"}
                    </span>
                  ) : null}
                  {estimateLabel ? (
                    <span data-testid={`triage-sheet-estimate-${draft.id}`}>
                      {estimateLabel}
                    </span>
                  ) : null}
                </div>
                {draft.first_tiny_step ? (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid={`triage-sheet-first-move-${draft.id}`}
                  >
                    First move: {draft.first_tiny_step}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => acceptTaskDraft(draft.id)}
                    className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                    data-testid={`triage-sheet-today-${draft.id}`}
                  >
                    Do today
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => backlogTaskDraft(draft.id)}
                    className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                    data-testid={`triage-sheet-accept-${draft.id}`}
                  >
                    Accept to backlog
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => rejectTaskDraft(draft.id)}
                    className={cn(
                      HIT_TARGET_MIN,
                      "touch-manipulation text-muted-foreground",
                    )}
                    data-testid={`triage-sheet-reject-${draft.id}`}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/triage"
        className={cn(
          HIT_TARGET_INVISIBLE,
          "text-sm font-semibold text-primary hover:underline",
        )}
        data-testid="triage-sheet-open-full"
      >
        Open full view →
      </Link>
    </MomentSheet>
  );
}
