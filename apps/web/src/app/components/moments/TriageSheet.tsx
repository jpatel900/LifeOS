"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWorkflow } from "@/lib/WorkflowContext";
import { Button } from "@/components/ui/button";
import { MomentSheet } from "./MomentSheet";
import { TaskMapDraftReview } from "./TaskMapDraftReview";
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
 *
 * FR-031 slice F3 (#664): "Do today" now also surfaces a one-tap "Map it"
 * offer for the task it just created — `acceptTaskDraft` returns the new
 * task's id, and the offer reuses the existing `requestTaskMapDraft` action
 * plus the same `TaskMapDraftReview` one-pass-approve surface the Flow
 * moment's manual "Draft map" button already renders
 * (`TaskMapSection.tsx`); no new draft/review plumbing. "Not now" only
 * clears local `useState` — it never calls `requestTaskMapDraft`, so
 * declining costs nothing and leaves no trace (NFR-001/NFR-005: generation
 * stays strictly on-demand, never background). The offer is local to this
 * sheet (cleared when it closes); the Flow moment's manual "Draft map"
 * button is untouched.
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
  const {
    state,
    syncStatus,
    acceptTaskDraft,
    backlogTaskDraft,
    rejectTaskDraft,
    taskMapDraft,
    requestTaskMapDraft,
    dismissTaskMapDraft,
    approveTaskMapDraft,
  } = useWorkflow();

  // FR-031 slice F3 (#664): the one-tap "map it" offer for the task "Do
  // today" just created. Local UI state only — never persisted, never
  // reconstructed from the global `taskMapDraft` on its own, so closing the
  // sheet (see the effect below) cleanly forgets it. Holding the title
  // alongside the id lets the offer copy name the task without a re-lookup
  // once it's no longer in `pendingDrafts`.
  const [mapOffer, setMapOffer] = useState<{
    taskId: string;
    title: string;
  } | null>(null);

  // A closed sheet should never reopen onto a stale offer from a previous
  // visit. This only clears local UI state — an already-in-flight
  // `requestTaskMapDraft` call (if the owner tapped "Map it" then closed the
  // sheet before it resolved) keeps running; its result lands in the shared
  // `taskMapDraft` state and surfaces later wherever that task is next
  // focused (e.g. the Flow moment), same as any other on-demand draft.
  useEffect(() => {
    if (!open) {
      setMapOffer(null);
    }
  }, [open]);

  // Mirrors buildCockpitViewModel's `activeArea ?? areas[0]` fallback so an
  // "All areas" selection resolves to the same area the pipeline badge used
  // to compute its count.
  const resolvedAreaId = selectedAreaId ?? state.areas[0]?.id ?? null;

  const pendingDrafts = state.taskDrafts.filter(
    (draft) =>
      draft.status === "pending" &&
      (resolvedAreaId ? draft.area_id === resolvedAreaId : true),
  );

  // #689 (read path): raw captures used to be invisible here — the owner
  // captured a thought, followed "Decide now" into this sheet, and met
  // "Nothing waiting in triage". Every capture is persisted as a capture
  // item first (stageAndPersistRawCapture), and only an AI/mock parse turns
  // it into a task draft — so in local mode (parse skipped or declined) the
  // thought lives ONLY in `captureItems`. List them, plainly, same area
  // scoping as the pipeline "Capture" badge (`buildPipelineCounts`'s
  // actionableCapture filter plus `triage_required`, the parse-later
  // status). Presentation-only: no new write path, rows are read-only.
  // A parsed capture keeps status "triage_required" while its draft sits in
  // the pending list above — exclude any capture a draft already points at
  // (task_drafts.capture_item_id), so a thought is never listed twice.
  const draftedCaptureIds = new Set(
    state.taskDrafts
      .map((draft) => draft.capture_item_id)
      .filter((id): id is string => Boolean(id)),
  );
  const unsortedCaptures = state.captureItems.filter(
    (item) =>
      (item.status === "new" || item.status === "triage_required") &&
      !draftedCaptureIds.has(item.id) &&
      (resolvedAreaId ? item.area_id === resolvedAreaId : true),
  );

  const showMapOfferReady =
    mapOffer !== null &&
    taskMapDraft.phase === "ready" &&
    taskMapDraft.taskId === mapOffer.taskId;
  const mapOfferPending =
    mapOffer !== null &&
    taskMapDraft.phase === "pending" &&
    taskMapDraft.taskId === mapOffer.taskId;
  const mapOfferFailed =
    mapOffer !== null &&
    taskMapDraft.phase === "failed" &&
    taskMapDraft.taskId === mapOffer.taskId
      ? taskMapDraft.message
      : null;

  return (
    <MomentSheet open={open} title="Triage" onClose={onClose}>
      {mapOffer ? (
        <div
          className="workflow-compact-item grid gap-2 rounded-lg border border-border p-3"
          data-testid="triage-map-offer"
        >
          {showMapOfferReady && taskMapDraft.phase === "ready" ? (
            <TaskMapDraftReview
              draft={taskMapDraft.draft}
              onApprove={(graph) => {
                void approveTaskMapDraft(mapOffer.taskId, graph);
                setMapOffer(null);
              }}
              onDismiss={() => {
                dismissTaskMapDraft();
                setMapOffer(null);
              }}
            />
          ) : (
            <>
              <p className="text-sm font-medium">
                “{mapOffer.title}” is on today. Map it out?
              </p>
              {mapOfferFailed ? (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid="triage-map-offer-notice"
                >
                  {mapOfferFailed}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void requestTaskMapDraft(mapOffer.taskId)}
                  disabled={mapOfferPending}
                  className={cn(HIT_TARGET_MIN, "touch-manipulation")}
                  data-testid="triage-map-offer-accept"
                >
                  {mapOfferPending ? "Mapping…" : "Map it"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMapOffer(null)}
                  className={cn(
                    HIT_TARGET_MIN,
                    "touch-manipulation text-muted-foreground",
                  )}
                  data-testid="triage-map-offer-dismiss"
                >
                  Not now
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {pendingDrafts.length === 0 && unsortedCaptures.length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="triage-sheet-empty"
        >
          Nothing waiting in triage — press C to capture the first thing.
        </p>
      ) : pendingDrafts.length === 0 ? null : (
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
                    onClick={() => {
                      const taskId = acceptTaskDraft(draft.id);
                      if (taskId) {
                        setMapOffer({ taskId, title: draft.title });
                      }
                    }}
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

      {unsortedCaptures.length > 0 ? (
        <div className="grid gap-2" data-testid="triage-sheet-captures">
          {/* #689: glance level first (#692) — what these are and that they
              are safe; the per-row text is the detail. */}
          <p className="text-xs font-semibold text-muted-foreground">
            Captured, not sorted yet
          </p>
          <ul className="grid gap-2">
            {unsortedCaptures.map((item) => {
              const area = state.areas.find(
                (candidate) => candidate.id === item.area_id,
              );
              return (
                <li
                  key={item.id}
                  className="workflow-compact-item grid gap-1.5 rounded-lg border border-border p-3"
                  data-testid={`triage-sheet-capture-${item.id}`}
                >
                  <p className="text-sm font-medium">{item.raw_text}</p>
                  <p className="text-xs text-muted-foreground">
                    {area ? `${area.name} · ` : ""}
                    Saved as you wrote it — sorting it into a task is the next
                    step here.
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* #689 item 3: when signed out, say where these live, plainly, with
          the door right here. */}
      {syncStatus.signedOut ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="triage-sheet-signedout-note"
        >
          Saved on this device.{" "}
          <Link
            href="/login?next=/"
            className="font-semibold text-foreground underline underline-offset-2"
            data-testid="triage-sheet-signin-link"
          >
            Sign in
          </Link>{" "}
          to keep captures on all your devices.
        </p>
      ) : null}

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
