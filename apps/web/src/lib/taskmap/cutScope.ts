import { validateTaskMapForPersistence } from "./persistence";
import {
  cutScopeCandidates,
  type TaskMapGraph,
  type TaskMapNode,
} from "./graph";

/**
 * FR-031 slice 7 — the DoD-cap CUT SCOPE moment surfaces the map's
 * not-yet-completed optional nodes as ready-made cut candidates (FR-031
 * acceptance criterion, FR-025 tie-in).
 *
 * This is a pure selector: given the persisted, possibly-null
 * `progression_map` / `map_status` pair for a task, it returns the
 * candidates the cap-moment UI should list, or `[]` when there is nothing
 * to surface. It never mutates the map (NS-INV-4) — callers only read from
 * it to prefill the existing cut-scope text input.
 *
 * "Ready-made cut candidate" requires an APPROVED map (a draft is not yet
 * something the operator has committed to, so it is not a legible fallback
 * yet) with at least one optional node that is not yet complete. Red nodes
 * are never candidates (`cutScopeCandidates` already excludes them).
 */
export interface CutScopeCandidateTask {
  progression_map?: unknown;
  map_status?: "draft" | "approved" | "superseded" | null;
}

export function cutScopeCandidatesForTask(
  task: CutScopeCandidateTask | null | undefined,
): TaskMapNode[] {
  if (!task || task.map_status !== "approved" || !task.progression_map) {
    return [];
  }

  const validated = validateTaskMapForPersistence(task.progression_map);
  if (!validated.ok) {
    // Defensive: a persisted map that no longer validates never blocks or
    // corrupts the cap flow -- it simply surfaces no candidates, same as
    // the TaskMapSection fallback for the Flow moment.
    return [];
  }

  return cutScopeCandidates(validated.graph as TaskMapGraph);
}

/**
 * Pure text helper for the cap-moment "tap a candidate to append it"
 * interaction. Appends `title` to `currentNote` with a "; " separator,
 * skipping the append if the title is already present (tapping the same
 * candidate twice should not duplicate it). Never touches the map itself --
 * this only builds the text default for the existing cut-scope DoD input.
 */
export function appendCutScopeNote(currentNote: string, title: string): string {
  const trimmedNote = currentNote.trim();
  const trimmedTitle = title.trim();

  if (!trimmedTitle) {
    return trimmedNote;
  }

  if (!trimmedNote) {
    return trimmedTitle;
  }

  if (trimmedNote.includes(trimmedTitle)) {
    return trimmedNote;
  }

  return `${trimmedNote}; ${trimmedTitle}`;
}
