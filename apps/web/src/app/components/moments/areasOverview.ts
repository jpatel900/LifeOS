import type { Phase2MockArea } from "@/lib/types";
import type { WorkflowState } from "@/lib/workflow";
import { selectUnsortedCaptures } from "@/lib/workflow/captureStatus";

/**
 * Final UX Loop C2-S5 (#687) — the All-areas surface, as pure data.
 *
 * ## Genuinely all areas
 *
 * This selector takes no `selectedAreaId` and has no `?? areas[0]` fallback.
 * That is the point: the legacy `/areas` screen was already global in its
 * columns (`viewModel.ts`'s `global.*`), and the ported surface keeps that
 * property by construction rather than by remembering to pass null. The same
 * slice fixes the sibling half of #691 in `pipelineCounts.ts`, where a null
 * selection really was silently becoming area 1.
 *
 * ## The count IS the columns
 *
 * `openCount` on an area row is defined as that area's share of the three OPEN
 * columns — decide + plan + scheduled — and nothing else. It is not a second,
 * parallel definition of "open" that happens to agree today.
 *
 * This is the specific defect class C2 exists to close. On the legacy screens
 * the printed number and the list under it were computed from different arrays
 * (S1 FINDINGS 3 and 5: a chip reading "2 Plan" above a rail holding 1 block; a
 * "6 carry over" headline over 4 distinct items). Here the arithmetic cannot
 * drift, because there is only one array. `areasOverviewTiesOut` states it as a
 * checkable invariant and `areasOverview.test.ts` pins it.
 *
 * A consequence worth stating plainly: nothing counted is invisible. Every row
 * inside `openCount` appears in a column the user can read on the same screen.
 * The legacy count included `backlog` and `blocked` tasks that appeared in no
 * column at all — counted, but nowhere to be found. They are in "To plan" now.
 *
 * ## What "waiting for a decision" counts, and why it changed
 *
 * The legacy **To triage** column read `state.taskDrafts` alone and therefore
 * said *"Nothing is waiting for a decision."* while an unsorted capture sat in
 * the account (S1 FINDING 2). A draft only exists once you have already SORTED
 * a capture, so the one thing genuinely awaiting a decision was the one thing
 * the column could not see.
 *
 * (FINDING 2 attributes that to `workflowServerLoad.ts:285`'s hardcoded
 * `taskDrafts: []`. That file is server-only — its single non-test caller is
 * the Telegram brief route — so it never fed this screen. The column was
 * simply reading the wrong noun. See that file's comment for the rest.)
 *
 * So the column now counts both nouns, and they are disjoint **by
 * construction**, not by a dedupe pass: `selectUnsortedCaptures` already drops
 * any capture a draft or task points at (`captureStatus.ts`'s
 * `captureHasTriageDecision`). One thought is one row, never two.
 *
 * ## Rows whose area cannot be resolved
 *
 * Dropped from the columns — a row cannot render an area dot for an area that
 * is not there — and equally absent from `openCount`, which is only ever
 * summed over known areas. Both sides drop the same rows, so the tie-out holds.
 * This matches the legacy screen, whose `makePipelineCard` returned null on an
 * unresolvable area.
 */

export const AREAS_OVERVIEW_COLUMN_IDS = [
  "decide",
  "plan",
  "scheduled",
  "done",
] as const;

export type AreasOverviewColumnId = (typeof AREAS_OVERVIEW_COLUMN_IDS)[number];

/** The three columns that represent work still open. "done" is not one. */
export const AREAS_OVERVIEW_OPEN_COLUMN_IDS = [
  "decide",
  "plan",
  "scheduled",
] as const satisfies readonly AreasOverviewColumnId[];

export interface AreasOverviewItem {
  /** Unique within the surface; the underlying capture or task id. */
  id: string;
  title: string;
  areaId: string;
  areaName: string;
  areaColor: string;
}

export interface AreasOverviewColumn {
  id: AreasOverviewColumnId;
  /** Plain-language heading shown above the list. */
  title: string;
  items: AreasOverviewItem[];
  /** What this column is, said when it is empty. */
  emptyWhat: string;
  /** The one next step that would fill it. */
  emptyNext: string;
}

export interface AreasOverviewRow {
  area: Phase2MockArea;
  /** This area's share of the three open columns. */
  openCount: number;
}

export interface AreasOverviewVM {
  rows: AreasOverviewRow[];
  columns: AreasOverviewColumn[];
  /** Sum of every row's `openCount`. */
  totalOpen: number;
}

const OPEN_TASK_STATUSES = ["active", "backlog", "blocked"] as const;

function itemFor(
  source: { id: string; title: string; area_id: string },
  areasById: Map<string, Phase2MockArea>,
): AreasOverviewItem | null {
  const area = areasById.get(source.area_id);
  if (!area) return null;
  return {
    id: source.id,
    title: source.title,
    areaId: area.id,
    areaName: area.name,
    areaColor: area.color,
  };
}

export function buildAreasOverview(state: WorkflowState): AreasOverviewVM {
  const areasById = new Map(state.areas.map((area) => [area.id, area]));
  const resolve = (
    sources: { id: string; title: string; area_id: string }[],
  ): AreasOverviewItem[] =>
    sources
      .map((source) => itemFor(source, areasById))
      .filter((item): item is AreasOverviewItem => item !== null);

  // A capture's own words are its title — it has no other name yet, which is
  // precisely why it is still waiting for a decision.
  const unsortedCaptures = selectUnsortedCaptures(state).map((capture) => ({
    id: capture.id,
    title: capture.raw_text,
    area_id: capture.area_id,
  }));
  const pendingDrafts = state.taskDrafts
    .filter((draft) => draft.status === "pending")
    .map((draft) => ({
      id: draft.id,
      title: draft.title,
      area_id: draft.area_id,
    }));

  const columns: AreasOverviewColumn[] = [
    {
      id: "decide",
      title: "Waiting for a decision",
      items: resolve([...unsortedCaptures, ...pendingDrafts]),
      emptyWhat: "Nothing is waiting for a decision.",
      emptyNext: "Captured thoughts land here until you sort them.",
    },
    {
      id: "plan",
      title: "To plan",
      items: resolve(
        state.tasks.filter((task) =>
          (OPEN_TASK_STATUSES as readonly string[]).includes(task.status),
        ),
      ),
      emptyWhat: "Nothing is waiting for a time.",
      emptyNext: "Sort a thought into a task to move it here.",
    },
    {
      id: "scheduled",
      title: "Scheduled",
      items: resolve(state.tasks.filter((task) => task.status === "scheduled")),
      emptyWhat: "Nothing has a time yet.",
      emptyNext: "Give a task an hour in Plan to schedule it.",
    },
    {
      id: "done",
      title: "Done",
      items: resolve(state.tasks.filter((task) => task.status === "done")),
      emptyWhat: "Nothing has been finished yet.",
      emptyNext: "Finish a scheduled block to see it here.",
    },
  ];

  const openItems = columns
    .filter((column) =>
      (AREAS_OVERVIEW_OPEN_COLUMN_IDS as readonly string[]).includes(column.id),
    )
    .flatMap((column) => column.items);

  const rows: AreasOverviewRow[] = state.areas.map((area) => ({
    area,
    openCount: openItems.filter((item) => item.areaId === area.id).length,
  }));

  return {
    rows,
    columns,
    totalOpen: rows.reduce((sum, row) => sum + row.openCount, 0),
  };
}

/**
 * The invariant this surface is built on: every open item is attributed to
 * exactly one area row, and every area row's number is made only of open
 * items. Exported so the test pins the property itself rather than a set of
 * example numbers that could all drift together.
 */
export function areasOverviewTiesOut(vm: AreasOverviewVM): boolean {
  const openInColumns = vm.columns
    .filter((column) =>
      (AREAS_OVERVIEW_OPEN_COLUMN_IDS as readonly string[]).includes(column.id),
    )
    .reduce((sum, column) => sum + column.items.length, 0);
  return openInColumns === vm.totalOpen;
}
