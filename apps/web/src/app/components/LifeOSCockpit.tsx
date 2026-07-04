"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Phase2TaskDraft } from "@lifeos/schemas";
import {
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Focus,
  HeartPulse,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import { createArea, listAreas, updateAreaColor } from "@/lib/data/workflow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  persistedAreaIdForWorkflowAreaId,
  workflowAreaIdForPersistedArea,
} from "@/lib/workflowAreaMapping";
import {
  useWorkflow,
  type CaptureParseState,
  type WorkflowSyncStatus,
} from "@/lib/WorkflowContext";
import { ACCENT_PALETTE, buildCockpitAccentStyle } from "@/lib/cockpit/accent";
import {
  buildCockpitViewModel,
  PIPELINE_STAGES,
  type CockpitStage,
} from "@/lib/cockpit/viewModel";
import { cn } from "@/lib/utils";
import { GoogleCalendarApprovalBridge } from "./GoogleCalendarApprovalBridge";

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
  today: "/",
  capture: "/capture",
  triage: "/triage",
  plan: "/calendar",
  execute: "/execute",
  review: "/review",
  health: "/health",
  overview: "/areas",
};

const HOURS = Array.from({ length: 11 }, (_, index) => index + 8);

function formatHour(hour: number) {
  if (hour === 12) return "12p";
  return hour > 12 ? `${hour - 12}p` : `${hour}a`;
}

function estimate(task: { estimated_minutes_high: number | null }) {
  return task.estimated_minutes_high ?? 45;
}

function ringStyle(value: number, total: number, radius: number) {
  const dash = 2 * Math.PI * radius;
  const safeTotal = Math.max(total, 1);
  return {
    strokeDasharray: dash,
    strokeDashoffset: dash * (1 - Math.min(value / safeTotal, 1)),
  };
}

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
    captureParse,
    retryCaptureParseWithMock,
    acceptTaskDraft,
    backlogTaskDraft,
    rejectTaskDraft,
    editTaskDraft,
    splitTaskDraft,
    mergeTaskDrafts,
    addArea,
    updateAreaColor: updateLocalAreaColor,
    promoteBacklogTask,
    acceptLocalProposal,
    rejectLocalProposal,
    editLocalProposal,
    createLocalProposalForTask,
    planTaskAtHour,
    unplanTask,
    startTaskSession,
    markSession,
    carryForwardTask,
    deferTask,
    dropTask,
    saveReview,
  } = useWorkflow();
  const [stage, setStage] = useState<CockpitStage>(initialStage);
  const [dark, setDark] = useState(true);
  const [captureText, setCaptureText] = useState("");
  const [isCaptureSaving, setIsCaptureSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const captureSavingRef = useRef(false);
  const vm = useMemo(
    () => buildCockpitViewModel(state, selectedAreaId, dark),
    [dark, selectedAreaId, state],
  );
  const activeArea = vm.activeArea;
  const hasRealActiveArea = state.areas.some(
    (area) => area.id === activeArea.id,
  );

  useEffect(() => {
    setStage(initialStage);
  }, [initialStage]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("lifeos.cockpit.preferences");
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        dark?: boolean;
        areaId?: string | null;
      };
      if (typeof parsed.dark === "boolean") setDark(parsed.dark);
      if (
        parsed.areaId &&
        state.areas.some((area) => area.id === parsed.areaId)
      ) {
        setSelectedAreaId(parsed.areaId);
      }
    } catch {
      // Preferences are optional; blocked localStorage should not block work.
    }
    // Run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "lifeos.cockpit.preferences",
        JSON.stringify({
          dark,
          areaId: selectedAreaId,
          stage,
        }),
      );
    } catch {
      // Workflow remains usable when localStorage is blocked.
    }
  }, [dark, selectedAreaId, stage]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const interval = window.setInterval(() => {
      setRemaining((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [remaining, running]);

  useEffect(() => {
    if (running && remaining === 0 && activeTaskId) {
      setRunning(false);
    }
  }, [activeTaskId, remaining, running]);

  function navigate(nextStage: CockpitStage) {
    setStage(nextStage);
    const path = STAGE_PATHS[nextStage];
    if (path && typeof window !== "undefined") {
      window.history.pushState(null, "", path);
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

  function handleSaveCapture() {
    const text = captureText.trim();
    if (!text || captureSavingRef.current) return;
    if (!hasRealActiveArea) {
      showToast("Create an area before capture");
      return;
    }
    captureSavingRef.current = true;
    setIsCaptureSaving(true);
    submitCaptureText(text, activeArea.id);
    setCaptureText("");
    showToast("Saved; waiting in Triage");
    navigate("triage");
    window.setTimeout(() => {
      captureSavingRef.current = false;
      setIsCaptureSaving(false);
    }, 500);
  }

  function startFocus(taskId: string, minutes: number) {
    setActiveTaskId(taskId);
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
    setRunning(true);
    startTaskSession(taskId);
  }

  function finishSession(status: "completed" | "stuck" | "missed") {
    const actualMinutes = Math.max(0, Math.ceil((total - remaining) / 60));
    markSession(status, actualMinutes);
    setRunning(false);
    setRemaining(0);
    setActiveTaskId(null);
    showToast(status === "completed" ? "Session complete" : "Session logged");
    navigate("review");
  }

  function toggleFocus() {
    if (running) {
      const actualMinutes = Math.max(0, Math.ceil((total - remaining) / 60));
      markSession("paused", actualMinutes);
      setRunning(false);
      return;
    }

    setRunning(true);
  }

  function saveSideCapture(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!hasRealActiveArea) {
      showToast("Create an area before capture");
      return;
    }
    submitCaptureText(trimmed, activeArea.id);
    showToast("Side thought saved");
  }

  function createProposalForSelectedTask(taskId: string, hour: number) {
    const task = state.tasks.find((item) => item.id === taskId);
    const minutes =
      task?.estimated_minutes_high ?? task?.estimated_minutes_low ?? 45;
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
        <header className="flex flex-wrap items-center gap-1 rounded-[var(--cockpit-radius)] border border-[var(--ln)] bg-[var(--sf)] p-2 sm:gap-2">
          <button
            type="button"
            onClick={() => navigate("today")}
            className="flex min-h-10 items-center gap-2 rounded-full px-2 text-[var(--ink)] sm:min-h-11 sm:px-3"
          >
            <span className="grid size-7 place-items-center rounded-full bg-[var(--acc)] text-[var(--on-acc)]">
              ◆
            </span>
            <span className="font-semibold">LifeOS</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("overview")}
            className={cn(
              "min-h-10 rounded-full px-2 text-sm font-semibold sm:min-h-11 sm:px-3",
              stage === "overview"
                ? "bg-[var(--acc-sf)] text-[var(--ink)]"
                : "text-[var(--mut)] hover:bg-[var(--sf3)]",
            )}
          >
            All areas
          </button>
          <div className="order-last flex min-w-0 basis-full flex-wrap gap-1 sm:order-none sm:basis-auto sm:flex-1">
            {vm.areas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  setSelectedAreaId(area.id);
                  navigate("today");
                }}
                className={cn(
                  "flex min-h-10 max-w-full shrink-0 items-center gap-2 rounded-full px-3 text-sm sm:min-h-11",
                  activeArea.id === area.id
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
              className="flex items-center gap-1"
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
              className="grid min-h-10 min-w-10 place-items-center rounded-full text-[var(--mut)] hover:bg-[var(--sf3)] hover:text-[var(--ink)] sm:min-h-11 sm:min-w-11"
              aria-label="Add area"
            >
              <Plus size={18} />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsPaletteOpen((value) => !value)}
              className="grid min-h-10 min-w-10 place-items-center rounded-full border border-[var(--ln2)] sm:min-h-11 sm:min-w-11"
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
            className="grid min-h-10 min-w-10 place-items-center rounded-full text-[var(--mut)] hover:bg-[var(--sf3)] hover:text-[var(--ink)] sm:min-h-11 sm:min-w-11"
            aria-label="Toggle theme"
          >
            {dark ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>

        <SyncNotice status={syncStatus} />

        <CaptureParseNotice
          state={captureParse}
          onRetryWithMock={retryCaptureParseWithMock}
        />

        <nav
          className="relative grid grid-cols-6 gap-2 rounded-[var(--cockpit-radius)] border border-[var(--ln)] bg-[var(--sf)] p-2"
          aria-label="Workflow stages"
        >
          <div className="absolute left-8 right-8 top-1/2 h-px bg-[var(--ln2)]" />
          {PIPELINE_STAGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => navigate(item)}
              className="relative z-10 flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs text-[var(--mut)] hover:bg-[var(--sf3)]"
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border text-sm font-bold mono",
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

        <section className="min-h-[560px]">
          {stage === "today" ? (
            <TodayView vm={vm} onNavigate={navigate} />
          ) : null}
          {stage === "capture" ? (
            <CaptureView
              value={captureText}
              onChange={setCaptureText}
              saving={isCaptureSaving}
              hasArea={hasRealActiveArea}
              onSave={handleSaveCapture}
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
              onAcceptProposal={acceptLocalProposal}
              onRejectProposal={rejectLocalProposal}
              onNudgeProposal={nudgeProposalLater}
              onCreateProposal={createProposalForSelectedTask}
              onExecute={() => navigate("execute")}
              onCapture={() => navigate("capture")}
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
            />
          ) : null}
          {stage === "review" ? (
            <ReviewView
              vm={vm}
              onCarryForward={(taskId) => {
                carryForwardTask(taskId);
                navigate("plan");
              }}
              onDefer={deferTask}
              onDrop={dropTask}
              onSave={() => {
                saveReview();
                showToast("Review saved");
                navigate("today");
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
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--grn-sf)] px-4 py-2 text-sm font-semibold text-[var(--grn-fg)] shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--cockpit-radius)] border border-[var(--ln)] bg-[var(--sf)] p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SyncNotice({ status }: { status: WorkflowSyncStatus }) {
  const messages = [
    status.storage === "blocked"
      ? "Browser storage is blocked; this session may not restore after reload."
      : null,
    status.account === "local-only"
      ? (status.message ?? "Account sync is unavailable; changes stay local.")
      : null,
    status.account === "sync-error"
      ? (status.message ?? "Account sync failed; changes stay local.")
      : null,
    status.account === "synced" && status.pendingLocalChanges
      ? (status.message ?? "Some local changes still need account sync.")
      : null,
  ].filter(Boolean);

  if (!messages.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--cockpit-radius)] border border-[var(--amb-rng)] bg-[var(--amb-sf)] px-4 py-3 text-sm font-semibold text-[var(--amb-fg)]"
    >
      {messages[0]}
    </div>
  );
}

function CaptureParseNotice({
  state,
  onRetryWithMock,
}: {
  state: CaptureParseState;
  onRetryWithMock: () => void;
}) {
  if (state.phase === "idle") return null;
  if (state.phase === "parsed" && state.parser === "ai") return null;

  const message =
    state.phase === "parsing"
      ? "Parsing capture into drafts…"
      : state.phase === "parsed"
        ? state.status === "ai_unavailable"
          ? "AI parser is unavailable right now, so the built-in mock parser drafted this capture."
          : "AI parsing is turned off, so the built-in mock parser drafted this capture."
        : state.message;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="capture-parse-notice"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-[var(--cockpit-radius)] border px-4 py-3 text-sm font-semibold",
        state.phase === "failed"
          ? "border-[var(--amb-rng)] bg-[var(--amb-sf)] text-[var(--amb-fg)]"
          : "border-[var(--ln)] bg-[var(--sf)] text-[var(--mut)]",
      )}
    >
      <span>{message}</span>
      {state.phase === "failed" && state.canRetryWithMock ? (
        <button
          type="button"
          onClick={onRetryWithMock}
          className="min-h-10 rounded-full bg-[var(--btn)] px-4 font-bold text-[var(--btn-fg)]"
        >
          Parse with mock parser
        </button>
      ) : null}
    </div>
  );
}

function TodayView({
  vm,
  onNavigate,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onNavigate: (stage: CockpitStage) => void;
}) {
  const next =
    vm.inbox.length > 0
      ? {
          label: "Triage next",
          stage: "triage" as const,
          title: vm.inbox[0].title,
        }
      : vm.today.length > 0
        ? {
            label: "Plan next",
            stage: "plan" as const,
            title: vm.today[0].title,
          }
        : vm.planned.length > 0
          ? {
              label: "Start focus",
              stage: "execute" as const,
              title: vm.planned[0].task.title,
            }
          : {
              label: "Capture thought",
              stage: "capture" as const,
              title: "Nothing is waiting",
            };
  const bands = [
    { label: "To triage", count: vm.inbox.length, stage: "triage" as const },
    { label: "To plan", count: vm.today.length, stage: "plan" as const },
    { label: "Scheduled", count: vm.planned.length, stage: "execute" as const },
    { label: "Done", count: vm.done.length, stage: "review" as const },
  ];

  return (
    <div className="grid gap-5">
      <Panel className="min-h-72 content-center">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mono text-sm text-[var(--acc2)]">One move now</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-6xl">
            {next.title}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate(next.stage)}
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]"
          >
            {next.label}
            <ChevronRight size={18} />
          </button>
        </div>
      </Panel>
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">At a glance</h2>
          <span className="mono text-sm text-[var(--fnt)]">
            {vm.activeArea.name}
          </span>
        </div>
        <div className="flex h-16 overflow-hidden rounded-2xl border border-[var(--ln2)]">
          {bands.map((band) => (
            <button
              key={band.label}
              type="button"
              onClick={() => onNavigate(band.stage)}
              className="min-w-12 border-r border-[var(--bd)] px-3 text-left last:border-r-0"
              style={{
                flex: Math.max(1, band.count) + 0.6,
                background:
                  band.stage === "triage"
                    ? "var(--amb-sf)"
                    : band.stage === "review"
                      ? "var(--grn-sf)"
                      : "var(--blu-sf)",
                color:
                  band.stage === "triage"
                    ? "var(--amb-fg)"
                    : band.stage === "review"
                      ? "var(--grn-fg)"
                      : "var(--blu-fg)",
              }}
            >
              <span className="mono block text-lg font-bold">{band.count}</span>
              <span className="text-xs">{band.label}</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function CaptureView({
  value,
  onChange,
  saving,
  hasArea,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  saving: boolean;
  hasArea: boolean;
  onSave: () => void;
}) {
  const canSave = value.trim().length > 0 && !saving && hasArea;

  return (
    <Panel className="grid min-h-[560px] place-items-center">
      <div className="w-full max-w-2xl">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              onSave();
            }
          }}
          autoFocus
          placeholder="Drop the thought here."
          className="min-h-64 w-full resize-none border-0 bg-transparent text-3xl font-semibold leading-tight text-[var(--ink)] outline-none placeholder:text-[var(--fnt)] focus:caret-[var(--acc)]"
        />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[var(--mut)]">
            {hasArea ? "Saves raw text first" : "Create an area before capture"}
          </span>
          <div className="flex items-center gap-3">
            <span className="mono text-sm text-[var(--fnt)]">⌘↵</span>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className={cn(
                "min-h-12 rounded-full px-6 font-bold",
                canSave
                  ? "bg-[var(--acc)] text-[var(--on-acc)]"
                  : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
              )}
            >
              {saving ? "Saving" : "Save thought"}
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TriageView({
  vm,
  onDrop,
  onBacklog,
  onToday,
  onEdit,
  onSplit,
  onMerge,
  onPlan,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onDrop: (draftId: string) => void;
  onBacklog: (draftId: string) => void;
  onToday: (draftId: string) => void;
  onEdit: (
    draftId: string,
    changes: Partial<
      Pick<
        Phase2TaskDraft,
        "title" | "description" | "area_id" | "first_tiny_step"
      >
    >,
  ) => void;
  onSplit: (draftId: string, titles: [string, string]) => void;
  onMerge: (primaryDraftId: string, secondaryDraftId: string) => void;
  onPlan: () => void;
}) {
  const current = vm.inbox[0];
  const nextDraft = vm.inbox[1] ?? null;
  const [editTitle, setEditTitle] = useState(current?.title ?? "");
  const [editDescription, setEditDescription] = useState(
    current?.description ?? "",
  );
  const [editFirstStep, setEditFirstStep] = useState(
    current?.first_tiny_step ?? "",
  );
  const [editAreaId, setEditAreaId] = useState(
    current?.area_id ?? vm.activeArea.id,
  );
  const [splitFirst, setSplitFirst] = useState("");
  const [splitSecond, setSplitSecond] = useState("");

  useEffect(() => {
    setEditTitle(current?.title ?? "");
    setEditDescription(current?.description ?? "");
    setEditFirstStep(current?.first_tiny_step ?? "");
    setEditAreaId(current?.area_id ?? vm.activeArea.id);
    setSplitFirst("");
    setSplitSecond("");
  }, [
    current?.id,
    current?.area_id,
    current?.description,
    current?.first_tiny_step,
    current?.title,
    vm.activeArea.id,
  ]);

  if (!current) {
    return (
      <Panel className="grid min-h-[520px] place-items-center text-center">
        <div>
          <Check className="mx-auto mb-5 text-[var(--grn-fg)]" size={42} />
          <h1 className="text-4xl font-extrabold">Inbox clear</h1>
          <button
            type="button"
            onClick={onPlan}
            className="mt-7 min-h-12 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]"
          >
            Plan the day
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="grid min-h-[560px] place-items-center">
      <div className="w-full max-w-xl">
        <div className="rounded-[var(--cockpit-radius)] border border-[var(--acc-rng)] bg-[var(--acc-sf)] p-6">
          <p className="mono text-sm text-[var(--acc2)]">Needs a decision</p>
          <h1 className="mt-3 text-3xl font-extrabold">{current.title}</h1>
          <p className="mt-3 text-[var(--mut)]">{current.first_tiny_step}</p>
        </div>
        {current.breakdown ? (
          <section
            aria-label="Task breakdown"
            className="mt-4 rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
          >
            <p className="mono text-sm text-[var(--acc2)]">
              Start here (under 10 min)
            </p>
            <p className="mt-1 font-bold text-[var(--ink)]">
              {current.breakdown.kickstart_step}
            </p>
            <ol className="mt-4 grid gap-2">
              {[...current.breakdown.steps]
                .sort((a, b) => a.order - b.order)
                .map((step) => (
                  <li
                    key={step.order}
                    className="flex items-baseline gap-2 text-sm"
                  >
                    <span className="mono text-[var(--fnt)]">
                      {step.order}.
                    </span>
                    <span className="flex-1 text-[var(--ink)]">
                      {step.title}
                    </span>
                    {step.on_critical_path ? (
                      <span className="mono text-xs text-[var(--amb-fg)]">
                        critical path
                      </span>
                    ) : null}
                    {step.estimated_minutes !== null ? (
                      <span className="mono text-xs text-[var(--mut)]">
                        ~{step.estimated_minutes}m
                      </span>
                    ) : null}
                  </li>
                ))}
            </ol>
            {current.breakdown.sequence_summary ? (
              <p className="mt-3 text-sm text-[var(--mut)]">
                {current.breakdown.sequence_summary}
              </p>
            ) : null}
          </section>
        ) : null}
        <div className="mt-4 flex justify-center gap-1">
          {vm.inbox.map((item) => (
            <Circle
              key={item.id}
              size={10}
              className={
                item.id === current.id
                  ? "text-[var(--acc)]"
                  : "text-[var(--ln2)]"
              }
              fill="currentColor"
            />
          ))}
        </div>
        <div className="mt-7 grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onDrop(current.id)}
            className="min-h-14 rounded-2xl border border-[var(--ln2)] text-[var(--mut)]"
          >
            Drop
          </button>
          <button
            type="button"
            onClick={() => onBacklog(current.id)}
            className="min-h-14 rounded-2xl bg-[var(--blu-sf)] font-semibold text-[var(--blu-fg)]"
          >
            Someday
          </button>
          <button
            type="button"
            onClick={() => onToday(current.id)}
            className="min-h-14 rounded-2xl bg-[var(--acc)] font-bold text-[var(--on-acc)]"
          >
            Do today
          </button>
        </div>
        <details className="mt-5 rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4">
          <summary className="cursor-pointer font-bold">Adjust draft</summary>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-[var(--mut)]">
              Title
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="min-h-11 rounded-xl border border-[var(--ln2)] bg-[var(--sf)] px-3 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[var(--mut)]">
              First move
              <input
                value={editFirstStep}
                onChange={(event) => setEditFirstStep(event.target.value)}
                className="min-h-11 rounded-xl border border-[var(--ln2)] bg-[var(--sf)] px-3 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[var(--mut)]">
              Area
              <select
                value={editAreaId}
                onChange={(event) => setEditAreaId(event.target.value)}
                className="min-h-11 rounded-xl border border-[var(--ln2)] bg-[var(--sf)] px-3 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
              >
                {vm.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-[var(--mut)]">
              Notes
              <textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                className="min-h-20 rounded-xl border border-[var(--ln2)] bg-[var(--sf)] px-3 py-2 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                onEdit(current.id, {
                  title: editTitle.trim() || current.title,
                  description: editDescription.trim() || null,
                  first_tiny_step:
                    editFirstStep.trim() || current.first_tiny_step,
                  area_id: editAreaId,
                })
              }
              className="min-h-11 rounded-xl bg-[var(--btn)] font-bold text-[var(--btn-fg)]"
            >
              Save edits
            </button>
          </div>
        </details>
        <details className="mt-3 rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4">
          <summary className="cursor-pointer font-bold">Split or merge</summary>
          <div className="mt-4 grid gap-3">
            <input
              value={splitFirst}
              onChange={(event) => setSplitFirst(event.target.value)}
              placeholder="First split task"
              className="min-h-11 rounded-xl border border-[var(--ln2)] bg-[var(--sf)] px-3 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
            />
            <input
              value={splitSecond}
              onChange={(event) => setSplitSecond(event.target.value)}
              placeholder="Second split task"
              className="min-h-11 rounded-xl border border-[var(--ln2)] bg-[var(--sf)] px-3 text-[var(--ink)] outline-none focus:border-[var(--acc)]"
            />
            <button
              type="button"
              disabled={!splitFirst.trim() || !splitSecond.trim()}
              onClick={() =>
                onSplit(current.id, [splitFirst.trim(), splitSecond.trim()])
              }
              className={cn(
                "min-h-11 rounded-xl font-bold",
                splitFirst.trim() && splitSecond.trim()
                  ? "bg-[var(--acc)] text-[var(--on-acc)]"
                  : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
              )}
            >
              Split draft
            </button>
            <button
              type="button"
              disabled={!nextDraft}
              onClick={() => nextDraft && onMerge(current.id, nextDraft.id)}
              className={cn(
                "min-h-11 rounded-xl font-bold",
                nextDraft
                  ? "bg-[var(--blu-sf)] text-[var(--blu-fg)]"
                  : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
              )}
            >
              {nextDraft
                ? `Merge next: ${nextDraft.title}`
                : "No draft to merge"}
            </button>
          </div>
        </details>
      </div>
    </Panel>
  );
}

function PlanView({
  vm,
  selectedTaskId,
  onSelectTask,
  onPlan,
  onUnplan,
  onPromote,
  onAcceptProposal,
  onRejectProposal,
  onNudgeProposal,
  onCreateProposal,
  onExecute,
  onCapture,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onPlan: (taskId: string, hour: number) => void;
  onUnplan: (blockId: string) => void;
  onPromote: (taskId: string) => void;
  onAcceptProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
  onNudgeProposal: (proposalId: string) => void;
  onCreateProposal: (taskId: string, hour: number) => void;
  onExecute: () => void;
  onCapture: () => void;
}) {
  const onlyReadyTaskId = vm.today.length === 1 ? vm.today[0].id : null;
  const taskIdToPlace = selectedTaskId ?? onlyReadyTaskId;
  const hasReadyBlock = vm.planned.length > 0;
  const hasTaskToPlace = vm.today.length > 0;
  const firstOpenHour =
    HOURS.find((hour) => !vm.planned.some((item) => item.hour === hour)) ?? 9;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">Hour rail</h1>
          <span className="mono text-sm text-[var(--fnt)]">8a-6p</span>
        </div>
        <div className="grid gap-2">
          {HOURS.map((hour) => {
            const placed = vm.planned.find((item) => item.hour === hour);
            return (
              <button
                key={hour}
                type="button"
                onClick={() =>
                  placed
                    ? onUnplan(placed.block.id)
                    : taskIdToPlace
                      ? onPlan(taskIdToPlace, hour)
                      : undefined
                }
                className={cn(
                  "grid min-h-16 grid-cols-[58px_1fr] items-center rounded-2xl border p-3 text-left",
                  placed
                    ? "border-[var(--acc-rng)] bg-[var(--acc-sf)]"
                    : taskIdToPlace
                      ? "border-[var(--acc-rng)] bg-[var(--sf2)]"
                      : "border-[var(--ln)] bg-[var(--sf2)]",
                )}
              >
                <span className="mono text-sm text-[var(--fnt)]">
                  {formatHour(hour)}
                </span>
                <span>
                  {placed ? (
                    <>
                      <span className="block font-bold">
                        {placed.task.title}
                      </span>
                      <span className="text-sm text-[var(--mut)]">
                        Tap to unplan
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--mut)]">
                      {taskIdToPlace
                        ? "Drop here"
                        : vm.today.length > 1
                          ? "Select a task first"
                          : "Open hour"}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>
      <div className="grid gap-5">
        <Panel>
          <h2 className="text-xl font-bold">To place</h2>
          <div className="mt-4 grid gap-2">
            {vm.today.length ? (
              vm.today.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    onSelectTask(selectedTaskId === task.id ? null : task.id)
                  }
                  className={cn(
                    "rounded-2xl border p-4 text-left",
                    selectedTaskId === task.id
                      ? "border-[var(--acc-rng)] bg-[var(--acc-sf)]"
                      : "border-[var(--ln)] bg-[var(--sf2)]",
                  )}
                >
                  <span className="block font-bold">{task.title}</span>
                  <span className="mono text-sm text-[var(--fnt)]">
                    {estimate(task)}m
                  </span>
                </button>
              ))
            ) : (
              <p className="text-[var(--mut)]">No do-today tasks waiting.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <h2 className="text-xl font-bold">Someday</h2>
          <div className="mt-4 grid gap-2">
            {vm.backlog.length ? (
              vm.backlog.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onPromote(task.id)}
                  className="rounded-2xl bg-[var(--blu-sf)] p-4 text-left text-[var(--blu-fg)]"
                >
                  Move to today: {task.title}
                </button>
              ))
            ) : (
              <p className="text-[var(--mut)]">Nothing deferred here.</p>
            )}
          </div>
        </Panel>
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Proposals</h2>
            <button
              type="button"
              disabled={!taskIdToPlace}
              onClick={() =>
                taskIdToPlace && onCreateProposal(taskIdToPlace, firstOpenHour)
              }
              className={cn(
                "min-h-10 rounded-full px-4 text-sm font-bold",
                taskIdToPlace
                  ? "bg-[var(--blu-sf)] text-[var(--blu-fg)]"
                  : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
              )}
            >
              Draft block
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {vm.proposals.length ? (
              vm.proposals.map(({ allDayContexts, proposal, task, hour }) => (
                <div
                  key={proposal.id}
                  className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{task.title}</p>
                      <p className="mono mt-1 text-sm text-[var(--fnt)]">
                        {formatHour(hour)} · {proposal.status}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onAcceptProposal(proposal.id)}
                        className="min-h-9 rounded-full bg-[var(--acc)] px-3 text-sm font-bold text-[var(--on-acc)]"
                      >
                        Accept local
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {allDayContexts.map((context) => (
                      <span
                        key={`${proposal.id}:${context.id}`}
                        className="rounded-full border border-[var(--ln2)] bg-[var(--sf3)] px-3 py-2 text-sm font-semibold text-[var(--mut)]"
                      >
                        All-day: {context.summary}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => onNudgeProposal(proposal.id)}
                      className="min-h-9 rounded-full bg-[var(--sf3)] px-3 text-sm font-semibold text-[var(--ink)]"
                    >
                      Move later
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectProposal(proposal.id)}
                      className="min-h-9 rounded-full border border-[var(--ln2)] px-3 text-sm font-semibold text-[var(--mut)]"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[var(--mut)]">
                {vm.today.length > 1
                  ? "Select a task first"
                  : "Select a task, then draft a local proposal."}
              </p>
            )}
          </div>
        </Panel>
        <Panel>
          <h2 className="text-xl font-bold">Calendar approval</h2>
          <details className="mt-3 text-[var(--mut)]">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Google writes are separate
            </summary>
            <p className="mt-3">
              This rail creates local blocks. External calendar writes still
              need explicit approval.
            </p>
          </details>
          <GoogleCalendarApprovalBridge
            proposals={vm.proposals}
            planned={vm.planned}
          />

          <button
            type="button"
            onClick={hasReadyBlock ? onExecute : onCapture}
            disabled={!hasReadyBlock && hasTaskToPlace}
            className={cn(
              "mt-5 min-h-12 w-full rounded-full font-bold",
              hasReadyBlock || !hasTaskToPlace
                ? "bg-[var(--btn)] text-[var(--btn-fg)]"
                : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
            )}
          >
            {hasReadyBlock
              ? "Start focusing"
              : hasTaskToPlace
                ? "Place a block first"
                : "Capture a thought"}
          </button>
        </Panel>
      </div>
    </div>
  );
}

function ExecuteView({
  vm,
  activeTaskId,
  running,
  remaining,
  total,
  onStart,
  onToggle,
  onFinish,
  onPlan,
  onCapture,
  onSideCapture,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
  onStart: (taskId: string, minutes: number) => void;
  onToggle: () => void;
  onFinish: (status: "completed" | "stuck" | "missed") => void;
  onPlan: () => void;
  onCapture: () => void;
  onSideCapture: (text: string) => void;
}) {
  const active = vm.planned.find((item) => item.task.id === activeTaskId);
  const minutes = Math.floor(remaining / 60);
  const seconds = `${remaining % 60}`.padStart(2, "0");
  const [sideCapture, setSideCapture] = useState("");

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel>
        <h1 className="text-2xl font-extrabold">Focus queue</h1>
        <div className="mt-4 grid gap-2">
          {vm.planned.length ? (
            vm.planned.map((item) => (
              <button
                key={item.block.id}
                type="button"
                onClick={() => onStart(item.task.id, estimate(item.task))}
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4 text-left hover:border-[var(--acc-rng)]"
              >
                <span className="mono text-sm text-[var(--fnt)]">
                  {formatHour(item.hour)} · {estimate(item.task)}m
                </span>
                <span className="mt-1 block font-bold">{item.task.title}</span>
              </button>
            ))
          ) : (
            <div className="grid gap-3">
              <p className="text-[var(--mut)]">No planned blocks yet.</p>
              <button
                type="button"
                onClick={onPlan}
                className="min-h-12 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]"
              >
                Plan the day
              </button>
              <button
                type="button"
                onClick={onCapture}
                className="min-h-12 rounded-full border border-[var(--ln2)] px-5 text-[var(--mut)]"
              >
                Capture thought
              </button>
            </div>
          )}
        </div>
      </Panel>
      <Panel className="grid place-items-center text-center">
        <div>
          <svg
            width="260"
            height="260"
            viewBox="0 0 260 260"
            className="mx-auto"
          >
            <circle
              cx="130"
              cy="130"
              r="104"
              fill="none"
              stroke="var(--track)"
              strokeWidth="16"
            />
            <circle
              cx="130"
              cy="130"
              r="104"
              fill="none"
              stroke="var(--acc)"
              strokeLinecap="round"
              strokeWidth="16"
              transform="rotate(-90 130 130)"
              style={ringStyle(total - remaining, total, 104)}
            />
          </svg>
          <p className="mono -mt-36 text-5xl font-bold">
            {active ? `${minutes}:${seconds}` : "--:--"}
          </p>
          <h2 className="mt-28 text-2xl font-extrabold">
            {active?.task.title ?? "Pick a block"}
          </h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {active ? (
              <>
                <button
                  type="button"
                  onClick={onToggle}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--acc)] px-5 font-bold text-[var(--on-acc)]"
                >
                  {running ? <Pause size={18} /> : <Play size={18} />}
                  {running ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => onFinish("completed")}
                  className="min-h-12 rounded-full bg-[var(--grn-sf)] px-5 font-bold text-[var(--grn-fg)]"
                >
                  Complete
                </button>
                <button
                  type="button"
                  onClick={() => onFinish("stuck")}
                  className="min-h-12 rounded-full bg-[var(--amb-sf)] px-5 font-bold text-[var(--amb-fg)]"
                >
                  Stuck
                </button>
                <button
                  type="button"
                  onClick={() => onFinish("missed")}
                  className="min-h-12 rounded-full border border-[var(--ln2)] px-5 text-[var(--mut)]"
                >
                  Missed
                </button>
              </>
            ) : (
              <Focus className="text-[var(--fnt)]" size={38} />
            )}
          </div>
          {active ? (
            <div className="mx-auto mt-7 grid max-w-md gap-2 text-left">
              <input
                value={sideCapture}
                onChange={(event) => setSideCapture(event.target.value)}
                placeholder="Capture without leaving focus."
                className="min-h-12 rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] px-4 text-[var(--ink)] outline-none placeholder:text-[var(--fnt)]"
              />
              <button
                type="button"
                disabled={!sideCapture.trim()}
                onClick={() => {
                  onSideCapture(sideCapture);
                  setSideCapture("");
                }}
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm font-bold",
                  sideCapture.trim()
                    ? "bg-[var(--btn)] text-[var(--btn-fg)]"
                    : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
                )}
              >
                Save side thought
              </button>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function ReviewView({
  vm,
  onCarryForward,
  onDefer,
  onDrop,
  onSave,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onCarryForward: (taskId: string) => void;
  onDefer: (taskId: string) => void;
  onDrop: (taskId: string) => void;
  onSave: () => void;
}) {
  const total =
    vm.done.length +
    vm.planned.length +
    vm.today.length +
    vm.reviewQueue.length;
  const done = vm.done.length;
  const carry = Math.max(total - done, 0);
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel className="grid place-items-center text-center">
        <div>
          <svg
            width="220"
            height="220"
            viewBox="0 0 220 220"
            className="mx-auto"
          >
            <circle
              cx="110"
              cy="110"
              r="86"
              fill="none"
              stroke="var(--track)"
              strokeWidth="14"
            />
            <circle
              cx="110"
              cy="110"
              r="86"
              fill="none"
              stroke="var(--grn-fg)"
              strokeLinecap="round"
              strokeWidth="14"
              transform="rotate(-90 110 110)"
              style={ringStyle(done, total, 86)}
            />
          </svg>
          <h1 className="mt-4 text-4xl font-extrabold">
            {carry === 0 ? "Day closed clean" : `${carry} carry over`}
          </h1>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="mt-7 min-h-12 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]"
        >
          Save review
        </button>
      </Panel>
      <Panel>
        <h2 className="text-xl font-bold">Planned vs actual</h2>
        <div className="mt-5 grid gap-3">
          {vm.sessions.length ? (
            vm.sessions.slice(0, 5).map((session) => (
              <div key={session.id}>
                <div className="mb-1 flex justify-between text-sm text-[var(--mut)]">
                  <span>{session.outcome}</span>
                  <span className="mono">
                    {session.actual_minutes ?? 0}/{session.planned_minutes ?? 0}
                    m
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--track)]">
                  <div
                    className="h-full rounded-full bg-[var(--acc)]"
                    style={{
                      width: `${Math.min(
                        ((session.actual_minutes ?? 0) /
                          Math.max(session.planned_minutes ?? 1, 1)) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="text-[var(--mut)]">
              Focus sessions will appear here.
            </p>
          )}
        </div>
        {vm.reviewQueue.length ? (
          <div className="mt-6 grid gap-3">
            <h2 className="text-xl font-bold">Needs recovery</h2>
            {vm.reviewQueue.map((item) => (
              <div
                key={`visible-${item.reason}-${item.task.id}`}
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-[var(--ink)]">
                      {item.task.title}
                    </p>
                    <p className="text-sm capitalize text-[var(--mut)]">
                      {item.reason}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onCarryForward(item.task.id)}
                      className="min-h-10 rounded-full bg-[var(--acc)] px-4 text-sm font-bold text-[var(--on-acc)]"
                    >
                      Carry forward
                    </button>
                    <button
                      type="button"
                      onClick={() => onDefer(item.task.id)}
                      className="min-h-10 rounded-full bg-[var(--blu-sf)] px-4 text-sm font-semibold text-[var(--blu-fg)]"
                    >
                      Defer
                    </button>
                    <button
                      type="button"
                      onClick={() => onDrop(item.task.id)}
                      className="min-h-10 rounded-full border border-[var(--ln2)] px-4 text-sm text-[var(--mut)]"
                    >
                      Drop
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <details className="mt-6 text-[var(--mut)]">
          <summary className="cursor-pointer font-semibold text-[var(--ink)]">
            Carry-forward details
          </summary>
          <p className="mt-3">
            {vm.reviewQueue.length
              ? `${vm.reviewQueue.length} item${
                  vm.reviewQueue.length === 1 ? "" : "s"
                } staged above.`
              : "Nothing needs recovery."}
          </p>
        </details>
      </Panel>
    </div>
  );
}

function HealthView({ vm }: { vm: ReturnType<typeof buildCockpitViewModel> }) {
  const [pulse, setPulse] = useState(false);
  const checks = vm.healthChecks;
  const critical = checks.filter((check) => check.status === "critical").length;
  const watch = checks.filter((check) => check.status === "watch").length;
  const healthy = checks.filter((check) => check.status === "healthy").length;
  const attention = critical + watch;
  const score = Math.round(
    checks.reduce((sum, check) => sum + check.score, 0) /
      Math.max(checks.length, 1),
  );
  const headline =
    attention === 0
      ? "All systems healthy"
      : `${attention} checks need attention`;

  return (
    <Panel className="min-h-[560px]">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid place-items-center text-center">
          <button
            type="button"
            onClick={() => {
              setPulse(true);
              window.setTimeout(() => setPulse(false), 1400);
            }}
            className={cn(
              "grid size-56 place-items-center rounded-full border border-[var(--grn-rng)] bg-[var(--grn-sf)] text-[var(--grn-fg)]",
              pulse && "animate-pulse",
            )}
          >
            <HeartPulse size={64} />
          </button>
          <h1 className="mt-6 text-4xl font-extrabold">{headline}</h1>
          <p className="mono mt-2 text-[var(--grn-fg)]">
            {score}/100 · {healthy}/{checks.length}
          </p>
        </div>
        <div className="grid content-center gap-3">
          {checks.slice(0, 3).map((check) => (
            <div
              key={check.id}
              className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{check.subsystem}</span>
                <Check
                  className={
                    check.status === "healthy"
                      ? "text-[var(--grn-fg)]"
                      : "text-[var(--amb-fg)]"
                  }
                  size={20}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--mut)]">{check.summary}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              setPulse(true);
              window.setTimeout(() => setPulse(false), 1400);
            }}
            className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--btn)] font-bold text-[var(--btn-fg)]"
          >
            <RefreshCw size={18} />
            Run system check
          </button>
          <details className="rounded-2xl border border-[var(--ln)] p-4 text-[var(--mut)]">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Full breakdown
            </summary>
            <div className="mt-3 grid gap-2">
              {checks.map((check) => (
                <p key={check.id}>
                  <span className="font-semibold text-[var(--ink)]">
                    {check.subsystem}:
                  </span>{" "}
                  {check.summary}
                </p>
              ))}
            </div>
          </details>
        </div>
      </div>
    </Panel>
  );
}

function OverviewView({
  vm,
  onSelectArea,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onSelectArea: (areaId: string) => void;
}) {
  const total = Math.max(
    vm.overview.reduce((sum, item) => sum + item.openCount, 0),
    1,
  );
  return (
    <div className="grid gap-5">
      <Panel>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">All areas overview</h1>
          <span className="text-sm text-[var(--mut)]">Global scope</span>
        </div>
        <div className="flex h-12 overflow-hidden rounded-full border border-[var(--ln2)]">
          {vm.overview.map((item) => (
            <button
              key={item.area.id}
              type="button"
              onClick={() => onSelectArea(item.area.id)}
              className="min-w-5"
              style={{
                flex: Math.max(item.openCount / total, 0.05),
                background: item.area.color,
              }}
              aria-label={`${item.area.name}: ${item.openCount} open`}
            />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {vm.overview.map((item) => (
            <button
              key={item.area.id}
              type="button"
              onClick={() => onSelectArea(item.area.id)}
              className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--sf3)] px-3 text-sm"
            >
              <span
                className="size-2.5 rounded-full"
                style={{ background: item.area.color }}
              />
              {item.area.name}
              <span className="mono text-[var(--fnt)]">{item.openCount}</span>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-4">
        {[
          { title: "To triage", items: vm.global.inbox },
          { title: "To plan", items: vm.global.today },
          { title: "Scheduled", items: vm.global.planned },
          { title: "Done", items: vm.global.done },
        ].map((column) => (
          <Panel key={column.title}>
            <h2 className="font-bold">{column.title}</h2>
            <div className="mt-3 grid gap-2">
              {column.items.length ? (
                column.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[var(--ln)] p-3 text-sm"
                    style={{
                      background: item.cardColor,
                      borderLeft: `3px solid ${item.area.color}`,
                    }}
                  >
                    <span className="block font-semibold">{item.title}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--mut)]">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: item.area.color }}
                      />
                      {item.area.name}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--mut)]">Empty</p>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
