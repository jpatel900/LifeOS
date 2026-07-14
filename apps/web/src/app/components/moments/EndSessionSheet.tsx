"use client";

import { useEffect, useState } from "react";
import { MomentSheet } from "./MomentSheet";

/**
 * #572 (execute/review contract completion, epic #555 item 5): the end
 * sheet that stands between "end this session" and any closed/verdict
 * copy. The audit's required model is: focus screen -> end sheet (outcome,
 * actual duration, optional note) -> only then a closed-state verdict.
 *
 * Outcome vocabulary is exactly the contract's four: done / partial /
 * skipped / stuck. "Partial" and "skipped" are first-class here, not an
 * afterthought bolted onto "missed" — they get the same calm treatment as
 * the other two.
 *
 * State truth (#551/#563 precedent): `onSave` is awaited. The Save button
 * shows "Saving…" and stays disabled until that promise settles; the sheet
 * only calls `onSaved` (letting the caller show verdict copy / navigate)
 * once the save attempt has actually resolved — never optimistically.
 */

export type EndSessionOutcome = "completed" | "partial" | "skipped" | "stuck";

const OUTCOME_OPTIONS: {
  value: EndSessionOutcome;
  label: string;
  hint: string;
}[] = [
  { value: "completed", label: "Done", hint: "Definition of done was met." },
  {
    value: "partial",
    label: "Partial",
    hint: "Made progress, not finished.",
  },
  {
    value: "skipped",
    label: "Skipped",
    hint: "Didn't get to it this block.",
  },
  { value: "stuck", label: "Stuck", hint: "Blocked — needs a smaller step." },
];

export interface EndSessionSheetProps {
  open: boolean;
  taskTitle: string;
  /** Prefill for the duration field, from the session clock. */
  elapsedMinutes: number;
  /** Outcome the sheet opens with pre-selected (e.g. which button was tapped). */
  initialOutcome?: EndSessionOutcome;
  onCancel(): void;
  /** Awaited by the sheet; resolving closes the sheet and reveals the verdict. */
  onSave(
    outcome: EndSessionOutcome,
    actualMinutes: number,
    note: string | null,
  ): Promise<void>;
}

export function EndSessionSheet({
  open,
  taskTitle,
  elapsedMinutes,
  initialOutcome = "completed",
  onCancel,
  onSave,
}: EndSessionSheetProps) {
  const [outcome, setOutcome] = useState<EndSessionOutcome>(initialOutcome);
  const [minutes, setMinutes] = useState(String(Math.max(0, elapsedMinutes)));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-prime the form every time the sheet opens fresh — never carry a
  // stale draft from a previous session into this one.
  useEffect(() => {
    if (open) {
      setOutcome(initialOutcome);
      setMinutes(String(Math.max(0, elapsedMinutes)));
      setNote("");
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const parsedMinutes = Math.max(0, Math.round(Number(minutes) || 0));
    const trimmedNote = note.trim();
    await onSave(
      outcome,
      parsedMinutes,
      trimmedNote.length ? trimmedNote : null,
    );
    // The caller's markSession never rejects (persistence failures resolve
    // as a truthful local-only save), so reaching here always means the
    // save attempt is settled — safe to hand control back.
    setSaving(false);
  }

  return (
    <MomentSheet open={open} title="End session" onClose={onCancel}>
      <div className="grid gap-4" data-testid="end-session-sheet">
        <p className="text-sm text-muted-foreground">{taskTitle}</p>

        <fieldset className="grid gap-2" data-testid="end-session-outcome">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Outcome
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {OUTCOME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                data-testid={`end-session-outcome-${option.value}`}
                aria-pressed={outcome === option.value}
                onClick={() => setOutcome(option.value)}
                disabled={saving}
                className={`min-h-12 rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  outcome === option.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="block">{option.label}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <label
          className="grid gap-1 text-sm font-semibold"
          htmlFor="end-session-minutes"
        >
          Actual duration (minutes)
          <input
            id="end-session-minutes"
            data-testid="end-session-minutes"
            type="number"
            min={0}
            inputMode="numeric"
            value={minutes}
            disabled={saving}
            onChange={(event) => setMinutes(event.target.value)}
            className="min-h-11 rounded-xl border border-border bg-transparent px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <label
          className="grid gap-1 text-sm font-semibold"
          htmlFor="end-session-note"
        >
          Note (optional)
          <textarea
            id="end-session-note"
            data-testid="end-session-note"
            value={note}
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="rounded-xl border border-border bg-transparent px-3 py-2 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="end-session-save"
            onClick={() => void handleSave()}
            disabled={saving}
            className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-70"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </MomentSheet>
  );
}
