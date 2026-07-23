"use client";

import { useEffect, useId, useState } from "react";

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
  const inputId = useId();
  const trimmed = value?.trim() ?? "";
  const [editing, setEditing] = useState(!trimmed);
  const [draft, setDraft] = useState(trimmed);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(trimmed);
    setEditing(!trimmed);
    setInvalid(false);
  }, [trimmed]);

  function commit() {
    const next = draft.trim();
    if (!next) {
      // Blank Save must never replace the fallback/display with blank
      // content — keep edit mode open and surface a calm, actionable
      // validation state instead of silently discarding the step (#589).
      setInvalid(true);
      return;
    }
    if (next !== trimmed) {
      onSave(next);
    }
    setEditing(false);
    setInvalid(false);
  }

  if (editing) {
    return (
      <div
        className="workflow-surface-card rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
        data-testid="first-tiny-step-card"
      >
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          First move
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id={inputId}
            type="text"
            autoFocus
            value={draft}
            placeholder="Define your first move — the smallest physical action to start."
            onChange={(event) => {
              setDraft(event.target.value);
              if (invalid) {
                setInvalid(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            data-testid="first-tiny-step-input"
            aria-invalid={invalid}
            aria-describedby={invalid ? "first-tiny-step-error" : undefined}
            className={`min-h-11 flex-1 rounded-xl border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              invalid ? "border-[var(--state-risk)]" : "border-[var(--ln)]"
            }`}
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
        {invalid ? (
          <p
            id="first-tiny-step-error"
            role="alert"
            data-testid="first-tiny-step-error"
            className="mt-2 text-xs font-medium text-[var(--state-risk)]"
          >
            Enter a first move before saving — it can&apos;t be blank.
          </p>
        ) : null}
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
