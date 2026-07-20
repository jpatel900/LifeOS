"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Plus, Sun } from "lucide-react";
import { createArea, listAreas, updateAreaColor } from "@/lib/data/workflow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  persistedAreaIdForWorkflowAreaId,
  workflowAreaIdForPersistedArea,
} from "@/lib/workflowAreaMapping";
import { useWorkflow } from "@/lib/WorkflowContext";
import { ACCENT_PALETTE, buildCockpitAccentStyle } from "@/lib/cockpit/accent";
import {
  buildCockpitViewModel,
  PIPELINE_STAGES,
  type CockpitStage,
} from "@/lib/cockpit/viewModel";
import { cn } from "@/lib/utils";
import { useFocusSession } from "./moments/useFocusSession";
import {
  runEndSessionPolicy,
  type EndSessionResult,
} from "./moments/endSessionPolicy";
import {
  CaptureParseNotice,
  SyncNotice,
  WipRefusalPanel,
} from "./cockpit/StatusBanners";
import { formatHour } from "./cockpit/shared";
import { TodayView } from "./cockpit/TodayView";
import { CaptureView } from "./cockpit/CaptureView";
import { TriageView } from "./cockpit/TriageView";
import { PlanView } from "./cockpit/PlanView";
import { ExecuteView } from "./cockpit/ExecuteView";
import { ReviewView } from "./cockpit/ReviewView";
import { HealthView } from "./cockpit/HealthView";
import { OverviewView } from "./cockpit/OverviewView";

// Re-exported so existing test imports (ExecuteViewCutScope.test.tsx,
// learningLoopSurfaces.test.tsx) that reach through this module keep
// working without needing to know the stage views moved (issue #590
// slice 2 — mechanical split, no behavior change).
export { ExecuteView, ReviewView };

const STAGE_LABELS: Record<CockpitStage, string> = {
  today: "Today",
  capture: "Capture",
  triage: "Triage",
  plan: "Plan",
  execute: "Execute",
  review: "Review",
  health: "Health",
  overview: "All areas",
};

const STAGE_PATHS: Partial<Record<CockpitStage, string>> = {
  today: "/today",
  capture: "/capture",
  triage: "/triage",
  plan: "/calendar",
  execute: "/execute",
  review: "/review",
  health: "/health",
  overview: "/areas",
};

// Single-sourced from STAGE_PATHS: the URL is the only source of navigation
// truth, so the pathname -> stage lookup must never drift from the
// stage -> pathname table above.
const STAGE_FOR_PATH: Record<string, CockpitStage> = Object.fromEntries(
  Object.entries(STAGE_PATHS).map(([stage, path]) => [path, stage]),
) as Record<string, CockpitStage>;

// LifeOSCockpit is the thin stage-router/shell (issue #590 slice 2): it owns
// shell chrome (header, area switcher, stage nav, toasts), the handlers that
// cross stage boundaries, and WorkflowContext wiring, then composes the
// per-stage screens in apps/web/src/app/components/cockpit/. The screens
// themselves were mechanically extracted with no rendered-output change —
// see that directory for TodayView/CaptureView/TriageView/PlanView/
// ExecuteView/ReviewView/HealthView/OverviewView.
export function LifeOSCockpit({
  initialStage,
}: {
  initialStage: CockpitStage;
}) {
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    syncStatus,
    syncPersistedAreas,
    submitCaptureText,
    submitCaptureRaw,
    captureParse,
    retryCaptureParseWithMock,
    acceptTaskDraft,
    backlogTaskDraft,
    rejectTaskDraft,
    editTaskDraft,
    splitTaskDraft,
    mergeTaskDrafts,
    rejectPersonLink,
    addArea,
    updateAreaColor: updateLocalAreaColor,
    promoteBacklogTask,
    acceptLocalProposal,
    rejectLocalProposal,
    editLocalProposal,
    createLocalProposalForTask,
    planTaskAtHour,
    updateTaskFirstTinyStep,
    unplanTask,
    carryForwardTask,
    deferTask,
    deferTaskWithSession,
    dropTask,
    saveReview,
    clearWipRefusal,
    swapWipSlot,
    markSession,
    overridePolicyProposals,
    decideOverridePolicyProposal,
    recalibrationForProposal,
    appliedDurationForArea,
    decideDurationRecalibration,
  } = useWorkflow();
  const router = useRouter();
  const pathname = usePathname();
  const stage = STAGE_FOR_PATH[pathname] ?? initialStage;
  // S9 (issue 261): proposals whose recalibration the user has decided this session,
  // so the sourced adjustment card resolves once accepted/dismissed.
  const [decidedRecalIds, setDecidedRecalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [dark, setDark] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  // #556 FR-026: true while the capture stage's CaptureCore is mid-
  // containment (waiting/degraded/conclusion). The stage nav, area chips,
  // and brand link disable in step so the user is genuinely held in
  // context — and so a mid-parse navigation can never race the
  // on-resolve navigate("triage") below. CaptureCore releases the lock on
  // unmount, so this can never stick.
  const [captureStageLocked, setCaptureStageLocked] = useState(false);
  const navLocked = stage === "capture" && captureStageLocked;
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const {
    activeTaskId,
    running,
    remaining,
    total,
    start,
    toggle,
    finish,
    reset,
  } = useFocusSession();
  const vm = useMemo(
    () => buildCockpitViewModel(state, selectedAreaId, dark),
    [dark, selectedAreaId, state],
  );
  const activeArea = vm.activeArea;
  const hasRealActiveArea = state.areas.some(
    (area) => area.id === activeArea.id,
  );

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("lifeos.cockpit.preferences");
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        dark?: boolean;
      };
      if (typeof parsed.dark === "boolean") setDark(parsed.dark);
      // #691: `areaId` is no longer restored (or written) here — the cockpit
      // used to keep its own localStorage copy of the area selection and
      // silently override the shared WorkflowContext value on mount, which
      // made screens disagree. WorkflowContext now persists the selection
      // itself; a stale `areaId` field in old stored prefs is simply ignored.
    } catch {
      // Preferences are optional; blocked localStorage should not block work.
    }
    // Run only once on mount.
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "lifeos.cockpit.preferences",
        JSON.stringify({
          dark,
          stage,
        }),
      );
    } catch {
      // Workflow remains usable when localStorage is blocked.
    }
  }, [dark, stage]);

  function navigate(nextStage: CockpitStage) {
    const path = STAGE_PATHS[nextStage];
    // The URL is the only source of navigation truth: pushing the pathname we
    // are already on is a no-op by definition (and a same-URL push would
    // re-run the route, remounting the page mid-interaction).
    if (path && path !== pathname) {
      router.push(path);
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 1400);
  }

  async function handleAddArea() {
    const name = newAreaName.trim();
    if (!name) return;
    const color = ACCENT_PALETTE[state.areas.length % ACCENT_PALETTE.length];
    addArea(name, color);
    setNewAreaName("");
    setIsAddingArea(false);
    showToast(`${name} added`);

    try {
      const client = createSupabaseBrowserClient();
      const result = await createArea(client, {
        name,
        description: null,
        color,
      });
      if (result.provider === "supabase") {
        const areasResult = await listAreas(client);
        if (areasResult.provider === "supabase") {
          syncPersistedAreas(areasResult.areas);
          setSelectedAreaId(workflowAreaIdForPersistedArea(result.area));
        }
      } else {
        showToast(`${name} added locally`);
      }
    } catch {
      showToast(`${name} added locally`);
    }
  }

  async function handleRecolor(color: string) {
    if (!hasRealActiveArea) {
      showToast("Create an area before recoloring");
      return;
    }
    updateLocalAreaColor(activeArea.id, color);
    setIsPaletteOpen(false);
    try {
      const persistedId = persistedAreaIdForWorkflowAreaId(
        activeArea.id,
        state.areas.map((area) => ({
          id: area.id,
          user_id: area.user_id,
          name: area.name,
          slug: area.name.toLowerCase().replace(/\s+/g, "-"),
          description: null,
          color: area.color,
          icon: null,
          sort_order: 0,
          is_active: true,
          created_at: area.created_at,
          updated_at: area.created_at,
        })),
      );
      if (persistedId) {
        await updateAreaColor(createSupabaseBrowserClient(), {
          area_id: persistedId,
          color,
        });
      }
    } catch {
      showToast("Recolor kept locally");
    }
  }

  function startFocus(taskId: string, minutes: number) {
    start(taskId, minutes);
  }

  // #572 (execute/review contract): the sheet has already captured
  // outcome/actual-duration/note before this ever runs — this function only
  // decides which persistence path applies (the DoD-cap and decision-task
  // paths still gather their own extra confirmation via window.prompt,
  // unchanged from before) and, per state truth (#551/#563), never shows a
  // "closed"/verdict toast or navigates to review until the save it
  // triggered has actually resolved.
  async function finishSession(
    status: "completed" | "partial" | "skipped" | "stuck",
    actualMinutes: number,
    note: string | null,
    cutScopeNoteDraft?: string,
  ): Promise<EndSessionResult> {
    const currentSession = state.executionSessions[0] ?? null;
    const currentTask = currentSession?.task_id
      ? state.tasks.find((task) => task.id === currentSession.task_id)
      : null;
    const capHit = remaining <= 0;
    const hasDefinitionOfDone = Boolean(
      currentTask?.definition_of_done?.trim(),
    );

    const result = await runEndSessionPolicy(
      {
        outcome: status,
        actualMinutes,
        note,
        capReached: capHit && hasDefinitionOfDone,
        task: currentTask
          ? {
              id: currentTask.id,
              definitionOfDone: currentTask.definition_of_done,
              taskType: currentTask.task_type,
            }
          : null,
        cutScopeNoteDraft,
      },
      {
        prompt: (message, defaultValue) =>
          defaultValue === undefined
            ? window.prompt(message)
            : window.prompt(message, defaultValue),
        markSession: (outcome, minutes, composedNote, capOutcome) =>
          capOutcome
            ? markSession(outcome, minutes, composedNote, capOutcome)
            : finish(outcome, minutes, composedNote),
        deferTaskWithSession,
      },
    );

    if (result.status === "aborted") {
      showToast(
        result.reason === "missing_cut_scope"
          ? "Write the cut scope before closing"
          : result.reason === "missing_carry_note"
            ? "Write a carry note before deferring"
            : result.reason === "missing_decision"
              ? "Decision choice is required before closing"
              : "Choose cut scope or defer at the cap",
      );
      return result;
    }

    reset();

    showToast(
      result.status === "split"
        ? result.resolution === "defer_failed"
          ? "Session saved — deferral failed; move it from Review"
          : "Session saved — deferral not yet confirmed"
        : result.resolution === "cut_scope"
          ? "Scope cut and session closed"
          : result.resolution === "deferred"
            ? "Deferred — saved and moved to backlog"
            : status === "completed"
              ? "Session complete"
              : status === "partial"
                ? "Partial progress saved"
                : status === "skipped"
                  ? "Skipped — carried to review"
                  : "Stuck — logged for review",
    );
    navigate("review");
    return result;
  }

  function toggleFocus() {
    toggle();
  }

  // #556: Execute side-capture is raw-save-only, never a background parse —
  // FR-026 forbids a fire-and-forget async wait, and the issue explicitly
  // allows this surface to satisfy containment trivially by never waiting on
  // one (preserves focus on the running session). Parsed later at triage,
  // same as the explicit "Save raw" action elsewhere.
  function saveSideCapture(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!hasRealActiveArea) {
      showToast("Create an area before capture");
      return;
    }
    submitCaptureRaw(trimmed, activeArea.id);
    showToast("Side thought saved");
  }

  function createProposalForSelectedTask(taskId: string, hour: number) {
    const task = state.tasks.find((item) => item.id === taskId);
    const baseMinutes =
      task?.estimated_minutes_high ?? task?.estimated_minutes_low ?? 45;
    // E1 apply-on-accept: if the user has accepted a recalibration for this
    // area, new blocks default to the adjusted duration.
    const minutes =
      appliedDurationForArea(task?.area_id ?? null, baseMinutes) ?? baseMinutes;
    const start = new Date();
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + minutes * 60 * 1000);
    createLocalProposalForTask({
      taskId,
      proposedStart: start.toISOString(),
      proposedEnd: end.toISOString(),
      rationale: `Drafted local proposal for ${formatHour(hour)}.`,
    });
    showToast("Proposal drafted locally");
  }

  function acceptProposalWithFeedback(proposalId: string) {
    acceptLocalProposal(proposalId);
    showToast("Placed on the hour rail");
  }

  function nudgeProposalLater(proposalId: string) {
    const proposal = state.timeBlockProposals.find(
      (item) => item.id === proposalId,
    );
    if (!proposal) return;
    const start = new Date(proposal.proposed_start);
    const end = new Date(proposal.proposed_end);
    start.setMinutes(start.getMinutes() + 30);
    end.setMinutes(end.getMinutes() + 30);
    editLocalProposal(proposalId, {
      proposed_start: start.toISOString(),
      proposed_end: end.toISOString(),
      rationale: `${proposal.rationale} Shifted later locally.`,
    });
    showToast("Proposal moved later");
  }

  return (
    <main
      className="lifeos-cockpit"
      data-theme={dark ? undefined : "light"}
      style={buildCockpitAccentStyle(activeArea.color, dark)}
      data-testid="lifeos-cockpit"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[var(--max)] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6">
        <a
          href="#stage-content"
          className="sr-only rounded-full bg-[var(--btn)] px-4 py-2 font-bold text-[var(--btn-fg)] focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          Skip to stage content
        </a>
        {/* C1 (#660 surface audit): was `flex-wrap` with the area-chip row
            forced to `basis-full` below `sm` — the moments masthead grammar
            is a single row (StartMoment.tsx). Recomposed to one row that
            never wraps: the logo and "All areas" chip stay fixed width
            (shrink-0), and the area-chip strip is the sole flexible,
            horizontally-scrollable region, so overflow scrolls sideways
            instead of dropping to a second row. */}
        <header className="flex flex-nowrap items-center gap-1 rounded-[var(--cockpit-radius)] border border-[var(--ln)] bg-[var(--sf)] p-2 sm:gap-2">
          <button
            type="button"
            onClick={() => router.push("/")}
            disabled={navLocked}
            // #574: min-h-11 (44px) at ALL widths — this was min-h-10 (40px)
            // below `sm`, exactly the audit's sub-44px mobile header finding
            // (ux-audit-2026-07-13-codex.md); same for the header controls
            // below. touch-manipulation drops the 300ms double-tap delay on
            // coarse pointers (same pattern as components/moments/hitTarget).
            className="flex min-h-11 shrink-0 touch-manipulation items-center gap-2 rounded-full px-2 text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
          >
            <span className="grid size-7 place-items-center rounded-full bg-[var(--acc)] text-[var(--on-acc)]">
              ◆
            </span>
            <span className="font-semibold">LifeOS</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("overview")}
            disabled={navLocked}
            className={cn(
              "min-h-11 shrink-0 touch-manipulation rounded-full px-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:px-3",
              stage === "overview"
                ? "bg-[var(--acc-sf)] text-[var(--ink)]"
                : "text-[var(--mut)] hover:bg-[var(--sf3)]",
            )}
          >
            All areas
          </button>
          <div className="flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto">
            {vm.areas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  setSelectedAreaId(area.id);
                  navigate("today");
                }}
                disabled={navLocked}
                className={cn(
                  "flex min-h-11 max-w-full shrink-0 touch-manipulation items-center gap-2 rounded-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50",
                  // #691: highlight from the real shared selection, not the
                  // view model's first-area fallback — with nothing selected
                  // (All areas) no chip may claim to be current.
                  selectedAreaId === area.id
                    ? "bg-[var(--acc-sf)] text-[var(--ink)]"
                    : "text-[var(--mut)] hover:bg-[var(--sf3)]",
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: area.color }}
                />
                {area.name}
              </button>
            ))}
          </div>
          {isAddingArea ? (
            <form
              className="flex shrink-0 items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                void handleAddArea();
              }}
            >
              <input
                aria-label="New area name"
                value={newAreaName}
                onChange={(event) => setNewAreaName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setIsAddingArea(false);
                }}
                className="h-11 w-36 rounded-full border border-[var(--ln2)] bg-[var(--sf2)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--acc)]"
                autoFocus
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingArea(true)}
              className="grid min-h-11 min-w-11 shrink-0 touch-manipulation place-items-center rounded-full text-[var(--mut)] hover:bg-[var(--sf3)] hover:text-[var(--ink)]"
              aria-label="Add area"
            >
              <Plus size={18} />
            </button>
          )}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsPaletteOpen((value) => !value)}
              className="grid min-h-11 min-w-11 touch-manipulation place-items-center rounded-full border border-[var(--ln2)]"
              aria-label="Change active area color"
            >
              <span className="size-5 rounded-full bg-[var(--acc)]" />
            </button>
            {isPaletteOpen ? (
              <div className="absolute right-0 z-20 mt-2 grid grid-cols-4 gap-2 rounded-2xl border border-[var(--ln2)] bg-[var(--sf2)] p-3 shadow-lg">
                {ACCENT_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => void handleRecolor(color)}
                    className="size-8 rounded-full border border-[var(--ln)]"
                    style={{ background: color }}
                    aria-label={`Use accent ${color}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setDark((value) => !value)}
            className="grid min-h-11 min-w-11 shrink-0 touch-manipulation place-items-center rounded-full text-[var(--mut)] hover:bg-[var(--sf3)] hover:text-[var(--ink)]"
            aria-label="Toggle theme"
          >
            {dark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>

        <SyncNotice status={syncStatus} />

        {/* #556: the capture stage shows its own containment sequence
            (raw text + parsing/degraded/conclusion) inline via CaptureCore —
            this global banner would just duplicate it, so it's suppressed
            there and still covers every other stage (e.g. a retry from
            triage). */}
        {stage !== "capture" ? (
          <CaptureParseNotice
            state={captureParse}
            onRetryWithMock={retryCaptureParseWithMock}
          />
        ) : null}

        <nav
          className="relative grid grid-cols-6 gap-2 rounded-[var(--cockpit-radius)] border border-[var(--ln)] bg-[var(--sf)] p-2"
          aria-label="Workflow stages"
        >
          <div className="absolute left-8 right-8 top-1/2 h-px bg-[var(--ln2)]" />
          {/* C3 (#660 surface audit): the cell radius is now the token
              scale's row step (--surface-radius-sm, 10px) instead of the
              ad-hoc rounded-2xl, and the count chip drops the mono/
              font-bold combo (an ad-hoc emphasis pairing not used
              elsewhere) for a plain font-semibold digit. */}
          {PIPELINE_STAGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => navigate(item)}
              disabled={navLocked}
              className="relative z-10 flex min-h-16 flex-col items-center justify-center gap-1 rounded-[var(--surface-radius-sm)] text-xs text-[var(--mut)] hover:bg-[var(--sf3)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border text-sm font-semibold",
                  stage === item
                    ? "border-[var(--acc-rng)] bg-[var(--acc-sf)] text-[var(--ink)] shadow-[0_0_0_6px_var(--acc-sf)]"
                    : "border-[var(--ln2)] bg-[var(--sf2)]",
                )}
              >
                {vm.counts[item]}
              </span>
              <span>{STAGE_LABELS[item]}</span>
            </button>
          ))}
        </nav>

        <section id="stage-content" tabIndex={-1} className="min-h-[560px]">
          {state.wipRefusal ? (
            <WipRefusalPanel
              refusal={state.wipRefusal}
              onSwap={swapWipSlot}
              onDismiss={clearWipRefusal}
            />
          ) : null}
          {stage === "today" ? (
            <TodayView vm={vm} onNavigate={navigate} />
          ) : null}
          {stage === "capture" ? (
            <CaptureView
              hasArea={hasRealActiveArea}
              captureParse={captureParse}
              onLockChange={setCaptureStageLocked}
              onRetryWithMock={retryCaptureParseWithMock}
              onSubmitParse={(text, returnHook) =>
                submitCaptureText(text, activeArea.id, returnHook)
              }
              onSubmitRaw={(text, returnHook) =>
                submitCaptureRaw(text, activeArea.id, returnHook)
              }
              onResolved={(outcome) => {
                // #556: truth-based nav/toast — only fires once the capture
                // actually resolved, never ahead of that (the old code
                // navigated and toasted "waiting in Triage" the instant
                // Save was clicked, before anything existed there). Only a
                // parsed capture puts a draft in the Triage inbox, so only
                // that outcome navigates there; a raw save is parsed later
                // at triage and would land on "Inbox clear" today, so it
                // stays here, ready for the next thought.
                if (outcome === "parsed") {
                  showToast("Saved; waiting in Triage");
                  navigate("triage");
                } else {
                  showToast("Saved raw");
                }
              }}
            />
          ) : null}
          {stage === "triage" ? (
            <TriageView
              vm={vm}
              onDrop={rejectTaskDraft}
              onBacklog={backlogTaskDraft}
              onToday={acceptTaskDraft}
              onEdit={editTaskDraft}
              onSplit={splitTaskDraft}
              onMerge={mergeTaskDrafts}
              onRejectPersonLink={rejectPersonLink}
              onPlan={() => navigate("plan")}
            />
          ) : null}
          {stage === "plan" ? (
            <PlanView
              vm={vm}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onPlan={(taskId, hour) => {
                planTaskAtHour(taskId, hour);
                setSelectedTaskId(null);
              }}
              onUnplan={unplanTask}
              onPromote={promoteBacklogTask}
              onAcceptProposal={acceptProposalWithFeedback}
              onRejectProposal={rejectLocalProposal}
              onNudgeProposal={nudgeProposalLater}
              onCreateProposal={createProposalForSelectedTask}
              onUpdateFirstTinyStep={updateTaskFirstTinyStep}
              onExecute={() => navigate("execute")}
              onCapture={() => navigate("capture")}
              recalibrationForProposal={recalibrationForProposal}
              appliedDurationForArea={appliedDurationForArea}
              decidedRecalIds={decidedRecalIds}
              onDecideRecalibration={(proposalId, input, decision) => {
                decideDurationRecalibration(input, decision);
                setDecidedRecalIds((current) =>
                  new Set(current).add(proposalId),
                );
              }}
            />
          ) : null}
          {stage === "execute" ? (
            <ExecuteView
              vm={vm}
              activeTaskId={activeTaskId}
              running={running}
              remaining={remaining}
              total={total}
              onStart={startFocus}
              onToggle={toggleFocus}
              onFinish={finishSession}
              onPlan={() => navigate("plan")}
              onCapture={() => navigate("capture")}
              onSideCapture={saveSideCapture}
              onUpdateFirstTinyStep={updateTaskFirstTinyStep}
            />
          ) : null}
          {stage === "review" ? (
            <ReviewView
              vm={vm}
              policyProposals={overridePolicyProposals}
              onDecidePolicy={decideOverridePolicyProposal}
              onCarryForward={(taskId) => {
                carryForwardTask(taskId);
                navigate("plan");
              }}
              onDefer={deferTask}
              onDrop={dropTask}
              onSave={() => {
                // #588: report closure only after persistence resolves.
                // "persisted" is the only outcome that claims the day closed;
                // local-only states the fallback truth; failure shows
                // recovery copy and stays on review so Save can be retried.
                void saveReview().then((result) => {
                  if (result === "persisted") {
                    showToast("Day closed — review saved");
                    navigate("today");
                    return;
                  }
                  if (result === "local-only") {
                    showToast("Review saved locally — account sync pending");
                    navigate("today");
                    return;
                  }
                  showToast("Couldn't save the review — day not closed yet");
                });
              }}
            />
          ) : null}
          {stage === "health" ? <HealthView vm={vm} /> : null}
          {stage === "overview" ? (
            <OverviewView
              vm={vm}
              onSelectArea={(areaId) => {
                setSelectedAreaId(areaId);
                navigate("today");
              }}
            />
          ) : null}
        </section>
      </div>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="cockpit-toast"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--grn-sf)] px-4 py-2 text-sm font-semibold text-[var(--grn-fg)] shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
