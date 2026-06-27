"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { useWorkflow } from "@/lib/WorkflowContext";
import {
  ACCENT_PALETTE,
  buildCockpitAccentStyle,
} from "@/lib/cockpit/accent";
import {
  buildCockpitViewModel,
  PIPELINE_STAGES,
  type CockpitStage,
} from "@/lib/cockpit/viewModel";
import { cn } from "@/lib/utils";

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
    syncPersistedAreas,
    submitCaptureText,
    acceptTaskDraft,
    backlogTaskDraft,
    rejectTaskDraft,
    addArea,
    updateAreaColor: updateLocalAreaColor,
    promoteBacklogTask,
    planTaskAtHour,
    unplanTask,
    startTaskSession,
    markSession,
  } = useWorkflow();
  const [stage, setStage] = useState<CockpitStage>(initialStage);
  const [dark, setDark] = useState(true);
  const [captureText, setCaptureText] = useState("");
  const [organizeAfterSave, setOrganizeAfterSave] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isAddingArea, setIsAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const vm = useMemo(
    () => buildCockpitViewModel(state, selectedAreaId, dark),
    [dark, selectedAreaId, state],
  );
  const activeArea = vm.activeArea;

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
        organizeAfterSave?: boolean;
      };
      if (typeof parsed.dark === "boolean") setDark(parsed.dark);
      if (typeof parsed.organizeAfterSave === "boolean") {
        setOrganizeAfterSave(parsed.organizeAfterSave);
      }
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
          organizeAfterSave,
        }),
      );
    } catch {
      // Workflow remains usable when localStorage is blocked.
    }
  }, [dark, organizeAfterSave, selectedAreaId, stage]);

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
      }
    } catch {
      // Local area already exists; persisted sync can recover later.
    }
  }

  async function handleRecolor(color: string) {
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
      // Local recolor should not fail just because account persistence is absent.
    }
  }

  function handleSaveCapture() {
    const text = captureText.trim();
    if (!text) return;
    submitCaptureText(text, activeArea.id);
    setCaptureText("");
    showToast(
      organizeAfterSave ? "Saved and queued for Triage" : "Saved to Triage",
    );
    navigate("triage");
  }

  function startFocus(taskId: string, minutes: number) {
    setActiveTaskId(taskId);
    setTotal(minutes * 60);
    setRemaining(minutes * 60);
    setRunning(true);
    startTaskSession(taskId);
  }

  function finishSession(status: "completed" | "stuck" | "missed") {
    markSession(status);
    setRunning(false);
    setRemaining(0);
    setActiveTaskId(null);
    showToast(status === "completed" ? "Session complete" : "Session logged");
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
            onClick={() => setStage("overview")}
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
              organizeAfterSave={organizeAfterSave}
              onToggleOrganize={() =>
                setOrganizeAfterSave((value) => !value)
              }
              onSave={handleSaveCapture}
            />
          ) : null}
          {stage === "triage" ? (
            <TriageView
              vm={vm}
              onDrop={rejectTaskDraft}
              onBacklog={backlogTaskDraft}
              onToday={acceptTaskDraft}
              onPlan={() => navigate("plan")}
            />
          ) : null}
          {stage === "plan" ? (
            <PlanView
              vm={vm}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onPlan={(hour) => {
                if (!selectedTaskId) return;
                planTaskAtHour(selectedTaskId, hour);
                setSelectedTaskId(null);
              }}
              onUnplan={unplanTask}
              onPromote={promoteBacklogTask}
              onExecute={() => navigate("execute")}
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
              onToggle={() => setRunning((value) => !value)}
              onFinish={finishSession}
            />
          ) : null}
          {stage === "review" ? <ReviewView vm={vm} /> : null}
          {stage === "health" ? <HealthView /> : null}
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
  organizeAfterSave,
  onToggleOrganize,
  onSave,
}: {
  value: string;
  onChange: (value: string) => void;
  organizeAfterSave: boolean;
  onToggleOrganize: () => void;
  onSave: () => void;
}) {
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
          <button
            type="button"
            onClick={onToggleOrganize}
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm font-semibold",
              organizeAfterSave
                ? "border-[var(--acc-rng)] bg-[var(--acc-sf)] text-[var(--ink)]"
                : "border-[var(--ln2)] text-[var(--mut)]",
            )}
          >
            Organize after save
          </button>
          <div className="flex items-center gap-3">
            <span className="mono text-sm text-[var(--fnt)]">⌘↵</span>
            <button
              type="button"
              onClick={onSave}
              className="min-h-12 rounded-full bg-[var(--acc)] px-6 font-bold text-[var(--on-acc)]"
            >
              Save thought
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
  onPlan,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  onDrop: (draftId: string) => void;
  onBacklog: (draftId: string) => void;
  onToday: (draftId: string) => void;
  onPlan: () => void;
}) {
  const current = vm.inbox[0];
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
        <div className="mt-4 flex justify-center gap-1">
          {vm.inbox.map((item) => (
            <Circle
              key={item.id}
              size={10}
              className={item.id === current.id ? "text-[var(--acc)]" : "text-[var(--ln2)]"}
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
  onExecute,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
  onPlan: (hour: number) => void;
  onUnplan: (blockId: string) => void;
  onPromote: (taskId: string) => void;
  onExecute: () => void;
}) {
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
                onClick={() => (placed ? onUnplan(placed.block.id) : onPlan(hour))}
                className={cn(
                  "grid min-h-16 grid-cols-[58px_1fr] items-center rounded-2xl border p-3 text-left",
                  placed
                    ? "border-[var(--acc-rng)] bg-[var(--acc-sf)]"
                    : selectedTaskId
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
                      <span className="block font-bold">{placed.task.title}</span>
                      <span className="text-sm text-[var(--mut)]">
                        Tap to unplan
                      </span>
                    </>
                  ) : (
                    <span className="text-[var(--mut)]">
                      {selectedTaskId ? "Drop here" : "Open hour"}
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
          <h2 className="text-xl font-bold">Calendar approval</h2>
          <details className="mt-3 text-[var(--mut)]">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Google writes are separate
            </summary>
            <p className="mt-3">
              This rail creates local blocks. External calendar writes still need
              explicit approval.
            </p>
          </details>
          <button
            type="button"
            onClick={onExecute}
            className="mt-5 min-h-12 w-full rounded-full bg-[var(--btn)] font-bold text-[var(--btn-fg)]"
          >
            Start focusing
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
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
  onStart: (taskId: string, minutes: number) => void;
  onToggle: () => void;
  onFinish: (status: "completed" | "stuck" | "missed") => void;
}) {
  const active = vm.planned.find((item) => item.task.id === activeTaskId);
  const minutes = Math.floor(remaining / 60);
  const seconds = `${remaining % 60}`.padStart(2, "0");

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
            <p className="text-[var(--mut)]">No planned blocks yet.</p>
          )}
        </div>
      </Panel>
      <Panel className="grid place-items-center text-center">
        <div>
          <svg width="260" height="260" viewBox="0 0 260 260" className="mx-auto">
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
        </div>
      </Panel>
    </div>
  );
}

function ReviewView({ vm }: { vm: ReturnType<typeof buildCockpitViewModel> }) {
  const total = vm.done.length + vm.planned.length + vm.today.length;
  const done = vm.done.length;
  const carry = Math.max(total - done, 0);
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel className="grid place-items-center text-center">
        <div>
          <svg width="220" height="220" viewBox="0 0 220 220" className="mx-auto">
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
                    {session.actual_minutes ?? 0}/{session.planned_minutes ?? 0}m
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
            <p className="text-[var(--mut)]">Focus sessions will appear here.</p>
          )}
        </div>
        <details className="mt-6 text-[var(--mut)]">
          <summary className="cursor-pointer font-semibold text-[var(--ink)]">
            Carry-forward details
          </summary>
          <div className="mt-3 grid gap-2">
            {[...vm.today, ...vm.backlog].map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3"
              >
                {task.title}
              </div>
            ))}
          </div>
        </details>
      </Panel>
    </div>
  );
}

function HealthView() {
  const [pulse, setPulse] = useState(false);
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
          <h1 className="mt-6 text-4xl font-extrabold">All systems healthy</h1>
          <p className="mono mt-2 text-[var(--grn-fg)]">11/11</p>
        </div>
        <div className="grid content-center gap-3">
          {["Storage", "Integrations", "Telemetry off"].map((label) => (
            <div
              key={label}
              className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{label}</span>
                <Check className="text-[var(--grn-fg)]" size={20} />
              </div>
              <p className="mt-1 text-sm text-[var(--mut)]">
                No action needed right now.
              </p>
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
            <p className="mt-3">
              Auth, database, parser, scheduler, calendar connector, and review
              logging are calm in this local cockpit view.
            </p>
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
          { title: "To triage", items: vm.inbox.map((item) => item.title) },
          { title: "To plan", items: vm.today.map((item) => item.title) },
          {
            title: "Scheduled",
            items: vm.planned.map((item) => item.task.title),
          },
          { title: "Done", items: vm.done.map((item) => item.title) },
        ].map((column) => (
          <Panel key={column.title}>
            <h2 className="font-bold">{column.title}</h2>
            <div className="mt-3 grid gap-2">
              {column.items.length ? (
                column.items.map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3 text-sm"
                  >
                    {item}
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
