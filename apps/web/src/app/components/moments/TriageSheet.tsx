"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { MomentSheet } from "./MomentSheet";
import { HIT_TARGET_INVISIBLE, HIT_TARGET_MIN } from "./hitTarget";

/**
 * Moments pass P5 — packet: PipelineOverview + demoted-surface sheets.
 *
 * Thin summary sheet for the Triage stage, opened from the Start moment's
 * Pipeline disclosure (UX-INV-5: at most 2 interactions from Today — open
 * disclosure, click Triage). Lists pending capture drafts, area-scoped the
 * same way the pipeline "Triage" badge counts them
 * (`buildPipelineCounts`/`buildCockpitViewModel`'s `inbox` filter): when no
 * area is selected ("All areas"), both the badge and this list resolve to
 * the first area (`state.areas[0]`), mirroring `buildCockpitViewModel`'s own
 * `activeArea ?? areas[0]` fallback — so the node's count and the sheet's
 * row count always agree, in every area-selection state. Accept-to-backlog
 * / reject use the real `useWorkflow()` actions
 * (`backlogTaskDraft`/`rejectTaskDraft`) — the same ones LifeOSCockpit's
 * TriageView wires to `onBacklog`/`onDrop`. Anything beyond this summary
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
  const { state, backlogTaskDraft, rejectTaskDraft } = useWorkflow();

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
          {pendingDrafts.map((draft) => (
            <li
              key={draft.id}
              className="workflow-compact-item grid gap-2 rounded-lg border border-border p-3"
              data-testid={`triage-sheet-item-${draft.id}`}
            >
              <p className="text-sm font-medium">{draft.title}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => backlogTaskDraft(draft.id)}
                  className={cn(
                    HIT_TARGET_MIN,
                    "rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted/60",
                  )}
                  data-testid={`triage-sheet-accept-${draft.id}`}
                >
                  Accept to backlog
                </button>
                <button
                  type="button"
                  onClick={() => rejectTaskDraft(draft.id)}
                  className={cn(
                    HIT_TARGET_MIN,
                    "rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted/60",
                  )}
                  data-testid={`triage-sheet-reject-${draft.id}`}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
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
