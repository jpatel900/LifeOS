import { useEffect, useState } from "react";
import { Focus, Pause, Play } from "lucide-react";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import {
  appendCutScopeNote,
  cutScopeCandidatesForTask,
} from "@/lib/taskmap/cutScope";
import { CaptureCore } from "../moments/CaptureCore";
import { CutScopeCandidates } from "../moments/CutScopeCandidates";
import {
  EndSessionSheet,
  type EndSessionOutcome,
} from "../moments/EndSessionSheet";
import { FirstTinyStepCard } from "../moments/FirstTinyStepCard";
import { estimate, formatHour, Panel, ringStyle } from "./shared";

// Execute stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change). Exported (not just the default
// stage-router usage) because tests/ExecuteViewCutScope.test.tsx renders it
// directly.
export function ExecuteView({
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
  onUpdateFirstTinyStep,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  activeTaskId: string | null;
  running: boolean;
  remaining: number;
  total: number;
  onStart: (taskId: string, minutes: number) => void;
  onToggle: () => void;
  onFinish: (
    status: "completed" | "partial" | "skipped" | "stuck",
    actualMinutes: number,
    note: string | null,
    cutScopeNoteDraft?: string,
  ) => Promise<void>;
  onPlan: () => void;
  onCapture: () => void;
  onSideCapture: (text: string) => void;
  onUpdateFirstTinyStep: (taskId: string, firstTinyStep: string) => void;
}) {
  const active = vm.planned.find((item) => item.task.id === activeTaskId);
  const minutes = Math.floor(remaining / 60);
  const seconds = `${remaining % 60}`.padStart(2, "0");
  // FR-031 slice 7: text draft for the DoD-cap CUT SCOPE moment, built up
  // by tapping "ready-made cuts from your map" candidates. Reset whenever
  // the active task changes so a stale note never bleeds into a different
  // task's cap moment.
  const [cutScopeNoteDraft, setCutScopeNoteDraft] = useState("");
  const cutScopeCandidatesForActiveTask = active
    ? cutScopeCandidatesForTask(active.task)
    : [];
  useEffect(() => {
    setCutScopeNoteDraft("");
  }, [activeTaskId]);
  // #572: the end sheet stands between "end this session" and any
  // "closed"/verdict copy or navigation. `onFinish` is awaited before the
  // sheet closes, so state truth holds even through the DoD-cap/decision
  // window.prompt sub-flows nested inside it.
  const [endSessionOpen, setEndSessionOpen] = useState(false);
  const elapsedMinutes = Math.max(0, Math.round((total - remaining) / 60));
  async function handleEndSessionSave(
    outcome: EndSessionOutcome,
    actualMinutes: number,
    note: string | null,
  ) {
    await onFinish(outcome, actualMinutes, note, cutScopeNoteDraft);
    setEndSessionOpen(false);
  }

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
          {active ? (
            <div className="mx-auto mt-3 max-w-md text-left">
              <FirstTinyStepCard
                value={active.task.first_tiny_step ?? null}
                onSave={(value) => onUpdateFirstTinyStep(active.task.id, value)}
              />
            </div>
          ) : null}
          {active?.task.definition_of_done ? (
            <p className="mx-auto mt-3 max-w-md text-sm text-[var(--mut)]">
              Definition of done: {active.task.definition_of_done}
            </p>
          ) : null}
          {active && remaining <= 0 && active.task.definition_of_done ? (
            <div className="mx-auto mt-4 max-w-md rounded-2xl border border-[var(--amb)] bg-[var(--amb-sf)] p-3 text-sm text-[var(--amb-fg)]">
              Time cap reached. If the definition of done is unmet, choose cut
              scope or defer; continuing silently is not an option.
              <CutScopeCandidates
                candidates={cutScopeCandidatesForActiveTask}
                note={cutScopeNoteDraft}
                onSelect={(candidate) =>
                  setCutScopeNoteDraft((current) =>
                    appendCutScopeNote(current, candidate.title),
                  )
                }
              />
            </div>
          ) : null}
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
                  data-testid="cockpit-end-session"
                  onClick={() => setEndSessionOpen(true)}
                  className="min-h-12 rounded-full bg-[var(--grn-sf)] px-5 font-bold text-[var(--grn-fg)]"
                >
                  End session
                </button>
              </>
            ) : (
              <Focus className="text-[var(--fnt)]" size={38} />
            )}
          </div>
          {active ? (
            <EndSessionSheet
              open={endSessionOpen}
              taskTitle={active.task.title}
              elapsedMinutes={elapsedMinutes}
              onCancel={() => setEndSessionOpen(false)}
              onSave={handleEndSessionSave}
            />
          ) : null}
          {active ? (
            // #556: raw-save-only (mode="raw-only") — Execute side-capture
            // never waits on a parse (issue #556 explicitly allows this;
            // see the CaptureView comment above and the #556 report). Same
            // shared CaptureCore as the other two surfaces, just without the
            // parse-wait it would otherwise contain.
            <div className="mx-auto mt-7 max-w-md text-left">
              <CaptureCore
                mode="raw-only"
                compact
                autoFocus={false}
                testIdPrefix="capture-side"
                placeholder="Capture without leaving focus."
                saveLabel="Save side thought"
                textareaClassName="min-h-12 rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] px-4 text-[var(--ink)] outline-none placeholder:text-[var(--fnt)]"
                saveButtonClassName="min-h-11 rounded-full px-4 text-sm font-bold bg-[var(--btn)] text-[var(--btn-fg)] disabled:cursor-not-allowed disabled:bg-[var(--sf3)] disabled:text-[var(--fnt)]"
                onSubmitRaw={(text) => onSideCapture(text)}
              />
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
