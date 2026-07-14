"use client";

import { useEffect, useState } from "react";

/**
 * #572 (execute/review contract completion, epic #555 item 5): the focus
 * screen shows the definition of done, not the required first tiny
 * physical move — `first_tiny_step` exists on the task (editable at plan
 * time, `updateTaskFirstTinyStep`) but the execute surface never rendered
 * it. This card is the committed opening move, shown prominently on both
 * the moments Flow surface and the cockpit Execute stage.
 *
 * Never blank: when `value` is empty, a calm inline-editable "define your
 * first move" affordance takes its place rather than an empty card.
 */
export interface FirstTinyStepCardProps {
  value: string | null;
  onSave(value: string): void;
}

export function FirstTinyStepCard({ value, onSave }: FirstTinyStepCardProps) {
  const trimmed = value?.trim() ?? "";
  const [editing, setEditing] = useState(!trimmed);
  const [draft, setDraft] = useState(trimmed);

  useEffect(() => {
    setDraft(trimmed);
    setEditing(!trimmed);
  }, [trimmed]);

  function commit() {
    const next = draft.trim();
    if (next && next !== trimmed) {
      onSave(next);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div
        className="workflow-surface-card rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
        data-testid="first-tiny-step-card"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          First move
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            autoFocus
            value={draft}
            placeholder="Define your first move — the smallest physical action to start."
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            data-testid="first-tiny-step-input"
            className="min-h-11 flex-1 rounded-xl border border-[var(--ln)] bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={commit}
            data-testid="first-tiny-step-save"
            className="min-h-11 rounded-full bg-[var(--btn)] px-4 text-sm font-bold text-[var(--btn-fg)]"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      data-testid="first-tiny-step-card"
      className="workflow-surface-card w-full rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4 text-left"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        First move
      </p>
      <p
        className="mt-1 text-base font-semibold text-[var(--ink)]"
        data-testid="first-tiny-step-value"
      >
        {trimmed}
      </p>
    </button>
  );
}
