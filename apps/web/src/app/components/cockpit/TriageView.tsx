import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";
import type { Phase2TaskDraft } from "@lifeos/schemas";
import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import { cn } from "@/lib/utils";
import { HIT_TARGET_MIN } from "../moments/hitTarget";
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
          {/* G1 (#660 surface audit): pinned off text-4xl font-extrabold
              (overshoots the fixed type scale and the 700-weight cap) onto
              the shared h1 grammar (2.25rem/700, .moments-greeting). */}
          <h1 className="moments-greeting">Inbox clear</h1>
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
        {/* G2 (#660 surface audit): the mono/accent-colored eyebrow is now
            the shared .moments-label grammar (sentence case in JSX, the
            class handles uppercase/tracking); the full accent-fill
            (bg-[var(--acc-sf)]) card is now the moments-card--emphasis
            pattern — quiet base surface plus a subtle accent ring, per
            calm-accent discipline (globals.css, .moments-card--emphasis
            doc comment) — rather than a full-card shout. The title
            (formerly a second h1) is a card title, not the page's own h1,
            so it moves to the .moments-card-title scale (1.5rem/620) like
            the other single-item hero cards (FirstMoveCard, CurrentBlockHero). */}
        <div
          className="moments-card moments-card--emphasis border p-6"
          style={{ borderColor: "var(--acc)" }}
        >
          <p className="moments-label">Needs a decision</p>
          <h2 className="workflow-surface-title moments-card-title mt-3">
            {current.title}
          </h2>
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
                    className={cn(
                      HIT_TARGET_MIN,
                      "mono rounded-full border border-[var(--ln)] px-3 text-xs text-[var(--mut)]",
                    )}
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
        {/* G3 (#660 surface audit): all three verdicts were full fills
            (Drop was already quiet-border; Someday was a solid --blu-sf
            slab) — calm-accent discipline keeps one filled primary
            ("Do today") with the other two as quiet border/tint
            secondaries. */}
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
            className="min-h-14 rounded-2xl border border-[var(--blu-rng)] font-semibold text-[var(--blu-fg)]"
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
