"use client";

import { cn } from "@/lib/utils";
import type { TaskMapNode } from "@/lib/taskmap/graph";

/**
 * FR-031 slice 7 — the DoD-cap CUT SCOPE moment surfaces the map's
 * not-yet-completed optional nodes as ready-made cut candidates.
 *
 * Renders nothing when there are no candidates, so a task with no map (or
 * no uncompleted optional nodes) leaves the cap banner exactly as it was
 * before this slice. Tapping a candidate does not touch the map -- it only
 * calls `onSelect` so the caller can fold the title into the existing
 * cut-scope note text (NS-INV-4: no silent map mutation). `note` is the
 * accumulated text so far; it is shown as a one-line preview and used to
 * mark already-tapped candidates as selected, so the tap has a visible
 * effect before the (blocking) cut-scope prompt ever opens.
 */
export interface CutScopeCandidatesProps {
  candidates: TaskMapNode[];
  note: string;
  onSelect(candidate: TaskMapNode): void;
}

export function CutScopeCandidates({
  candidates,
  note,
  onSelect,
}: CutScopeCandidatesProps) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div
      className="mx-auto mt-3 max-w-md text-left"
      data-testid="cut-scope-candidates"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--amb-fg)]">
        Ready-made cuts from your map
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {candidates.map((candidate) => {
          const selected = note.includes(candidate.title);
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(candidate)}
              className={cn(
                "min-h-11 rounded-full border px-3 py-1 text-sm",
                selected
                  ? "border-[var(--amb-fg)] bg-[var(--amb-fg)] text-[var(--amb-sf)]"
                  : "border-[var(--amb)] bg-[var(--amb-sf)] text-[var(--amb-fg)]",
              )}
              data-testid={`cut-scope-candidate-${candidate.id}`}
            >
              {candidate.title}
            </button>
          );
        })}
      </div>
      {note ? (
        <p
          className="mt-2 text-xs text-[var(--amb-fg)]"
          data-testid="cut-scope-note-preview"
        >
          Cut note: {note}
        </p>
      ) : null}
    </div>
  );
}
