import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import type { Phase2TaskDraft } from "@lifeos/schemas";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { cn } from "@/lib/utils";
import { Panel } from "./shared";

// Triage stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change).
export function TriageView({
  vm,
  onDrop,
  onBacklog,
  onToday,
  onEdit,
  onSplit,
  onMerge,
  onRejectPersonLink,
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
  onRejectPersonLink: (draftId: string, mentionIndex: number) => void;
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
              Start here (same first move)
            </p>
            <p className="mt-1 font-bold text-[var(--ink)]">
              {current.first_tiny_step}
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
        {current.person_mentions.length > 0 ? (
          <section
            aria-label="Proposed person links"
            className="mt-4 rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
          >
            <div className="flex items-center justify-between">
              <p className="mono text-sm text-[var(--acc2)]">People</p>
              {current.is_commitment ? (
                <span className="mono rounded-full bg-[var(--acc-sf)] px-2 py-0.5 text-xs text-[var(--acc2)]">
                  Commitment
                </span>
              ) : null}
            </div>
            <ul className="mt-3 grid gap-2">
              {current.person_mentions.map((mention, index) => (
                <li
                  key={`${mention.name}-${mention.role}-${index}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-[var(--ink)]">
                    <span className="font-bold">{mention.name}</span>
                    <span className="mono ml-2 text-xs text-[var(--mut)]">
                      {mention.role.replace("_", " ")}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRejectPersonLink(current.id, index)}
                    className="mono min-h-8 rounded-full border border-[var(--ln)] px-3 text-xs text-[var(--mut)]"
                  >
                    Not this person
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--mut)]">
              Links are proposals only. Removing one keeps the task as a plain
              task; nothing about a person is saved without your approval.
            </p>
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
