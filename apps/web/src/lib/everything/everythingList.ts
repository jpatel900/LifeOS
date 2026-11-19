// The Everything sheet (#1160, FR-050): one list of every thought, draft and
// task.
//
// This module owns the rules. The sheet only draws what it returns.
//
// One item = one truth (C1 Target Card 4). "Is this thought still waiting to
// be sorted" is NOT decided here: `captureStatus.ts` owns it for the whole
// app, and this module asks it. So a thought is a "Thought" here exactly when
// Start and Sort say it is waiting.
//
// - A task is one row.
// - Every pending draft is one row, the same rows Sort offers.
// - A thought is one row only while nothing else speaks for it: no task and
//   no pending draft points at it.
import type { Phase2CaptureItem } from "@lifeos/schemas";
import type { Phase2MockArea, Phase2MockTask } from "@/lib/types";
import { selectUnsortedCaptures } from "@/lib/workflow/captureStatus";
import type { WorkflowState } from "@/lib/workflow/shared";

export const EVERYTHING_STAGES = [
  "thought",
  "draft",
  "ready",
  "scheduled",
  "waiting",
  "done",
  "sorted",
  "letgo",
] as const;
export type EverythingStage = (typeof EVERYTHING_STAGES)[number];

/**
 * Plain words for each stage. "Let go" covers dropped, archived and rejected:
 * no shame. "Sorted" is a thought that was dealt with and has no task on this
 * device to show for it (it became a project, for example).
 */
export const EVERYTHING_STAGE_LABEL: Record<EverythingStage, string> = {
  thought: "Thought",
  draft: "Draft",
  ready: "Ready",
  scheduled: "Scheduled",
  waiting: "Waiting",
  done: "Done",
  sorted: "Sorted",
  letgo: "Let go",
};

const CLOSED_STAGES: ReadonlySet<EverythingStage> = new Set([
  "done",
  "sorted",
  "letgo",
]);

/** How far an item got: 0 thought, 1 draft, 2 task, 3 closed. */
const TRAIL_STEP: Record<EverythingStage, 0 | 1 | 2 | 3> = {
  thought: 0,
  draft: 1,
  ready: 2,
  scheduled: 2,
  waiting: 2,
  done: 3,
  sorted: 3,
  letgo: 3,
};

export const EVERYTHING_TRAIL_STEPS = [
  "Thought",
  "Draft",
  "Task",
  "Closed",
] as const;

export const EVERYTHING_GROUPINGS = [
  "due",
  "area",
  "stage",
  "entered",
] as const;
export type EverythingGrouping = (typeof EVERYTHING_GROUPINGS)[number];

export const EVERYTHING_GROUPING_LABEL: Record<EverythingGrouping, string> = {
  due: "Due date",
  area: "Area",
  stage: "Stage",
  entered: "Date entered",
};

export interface EverythingItem {
  /** Unique across kinds, so it is safe as a React key and a test id. */
  id: string;
  kind: "thought" | "draft" | "task";
  title: string;
  stage: EverythingStage;
  stageLabel: string;
  closed: boolean;
  trailStep: 0 | 1 | 2 | 3;
  areaId: string | null;
  areaName: string;
  areaColor: string | null;
  /** ISO time, or null when the item has no usable due date. */
  dueAt: string | null;
  dueLabel: string;
  /** ISO time the owner (or an agent) first gave this to LifeOS. */
  enteredAt: string;
  enteredLabel: string;
  /** Which agent entered it, when the text carries its mark. Else null. */
  source: string | null;
}

export interface EverythingGroup {
  id: string;
  label: string;
  items: EverythingItem[];
}

/** The area filter's value for "items with no area". */
export const EVERYTHING_NO_AREA = "__none__";
/** The source filter's value for "entered by the owner, not an agent". */
export const EVERYTHING_SOURCE_YOU = "you";

export interface EverythingFilters {
  grouping: EverythingGrouping;
  showClosed: boolean;
  search: string;
  /** null = every area; EVERYTHING_NO_AREA = only items with no area. */
  areaId: string | null;
  /** null = anyone; EVERYTHING_SOURCE_YOU; otherwise the agent's name. */
  source: string | null;
}

export interface EverythingList {
  /** Every item, before any filter. */
  total: number;
  /** Every item that is not closed, before any filter. */
  open: number;
  /** Every closed item, before any filter. */
  closed: number;
  /** Items left after the filters, across all groups. */
  shown: number;
  /** True when search, area or source is narrowing the list. */
  narrowed: boolean;
  /** True when at least one item has no area. */
  hasNoAreaItems: boolean;
  groups: EverythingGroup[];
  /** Agent names seen on any item, sorted, for the "entered by" filter. */
  sources: string[];
}

const NO_AREA_NAME = "No area";

/**
 * The agents that may mark a thought as theirs. A thought an agent sends ends
 * with "(via Hermes)" and so on; the agent's own instructions add it (nothing
 * in this repo does). The list is closed on purpose: the owner's own words,
 * such as "Pick up parcel (via Canada Post)", must stay untouched.
 *
 * The mark is display data only (INV-8: capture text is never an instruction).
 */
export const EVERYTHING_AGENT_NAMES = [
  "Hermes",
  "Claude",
  "Codex",
  "Kal",
] as const;

const SOURCE_MARK = new RegExp(
  `\\s*\\(via (${EVERYTHING_AGENT_NAMES.join("|")})\\)\\s*$`,
  "i",
);

export function splitSourceMark(text: string): {
  title: string;
  source: string | null;
} {
  const match = SOURCE_MARK.exec(text);
  if (!match) return { title: text.trim(), source: null };
  const title = text.slice(0, match.index).trim();
  // A text that is ONLY the mark keeps its words: an empty title helps no one.
  if (!title) return { title: text.trim(), source: null };
  const found = (match[1] ?? "").toLowerCase();
  const source =
    EVERYTHING_AGENT_NAMES.find((name) => name.toLowerCase() === found) ?? null;
  return { title, source };
}

function taskStage(task: Phase2MockTask): EverythingStage {
  switch (task.status) {
    case "done":
      return "done";
    case "dropped":
    case "archived":
      return "letgo";
    case "scheduled":
      return "scheduled";
    case "blocked":
      return "waiting";
    case "draft":
      return "draft";
    default:
      return task.waiting_on_person_id ? "waiting" : "ready";
  }
}

/** Milliseconds for an ISO time, or null when it is not a real time. */
function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole local days from `now` to `ms`. Negative = before today. */
function dayOffset(ms: number, now: Date): number {
  // Rounding absorbs the 23- and 25-hour days at a clock change.
  return Math.round(
    (startOfLocalDay(ms) - startOfLocalDay(now.getTime())) / DAY_MS,
  );
}

function relativeDay(iso: string, now: Date): string {
  const ms = timeOf(iso);
  if (ms === null) return "";
  const offset = dayOffset(ms, now);
  if (offset === 0) return "Today";
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";
  const date = new Date(ms);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function buildItems(state: WorkflowState, now: Date): EverythingItem[] {
  const areasById = new Map<string, Phase2MockArea>(
    state.areas.map((area) => [area.id, area]),
  );
  const capturesById = new Map<string, Phase2CaptureItem>(
    state.captureItems.map((capture) => [capture.id, capture]),
  );

  const make = (input: {
    id: string;
    kind: EverythingItem["kind"];
    rawTitle: string;
    sourceText: string | null;
    stage: EverythingStage;
    areaId: string | null;
    dueAt: string | null | undefined;
    enteredAt: string;
  }): EverythingItem => {
    const area = input.areaId ? areasById.get(input.areaId) : undefined;
    const ownTitle = splitSourceMark(input.rawTitle);
    const source =
      ownTitle.source ??
      (input.sourceText ? splitSourceMark(input.sourceText).source : null);
    // A due time that is not a real time is treated as no due date.
    const dueAt = timeOf(input.dueAt) === null ? null : (input.dueAt ?? null);
    return {
      id: input.id,
      kind: input.kind,
      title: ownTitle.title,
      stage: input.stage,
      stageLabel: EVERYTHING_STAGE_LABEL[input.stage],
      closed: CLOSED_STAGES.has(input.stage),
      trailStep: TRAIL_STEP[input.stage],
      areaId: area ? area.id : null,
      areaName: area ? area.name : NO_AREA_NAME,
      areaColor: area ? area.color : null,
      dueAt,
      dueLabel: dueAt ? relativeDay(dueAt, now) : "",
      enteredAt: input.enteredAt,
      enteredLabel: relativeDay(input.enteredAt, now),
      source,
    };
  };

  const items: EverythingItem[] = [];
  const spokenFor = new Set<string>();

  for (const task of state.tasks) {
    const capture = task.source_capture_item_id
      ? capturesById.get(task.source_capture_item_id)
      : undefined;
    if (task.source_capture_item_id) spokenFor.add(task.source_capture_item_id);
    items.push(
      make({
        id: `task:${task.id}`,
        kind: "task",
        rawTitle: task.title,
        sourceText: capture?.raw_text ?? null,
        stage: taskStage(task),
        areaId: task.area_id,
        dueAt: task.due_at,
        // The thought is when it was first entered; the task came later.
        enteredAt: capture?.created_at ?? task.created_at,
      }),
    );
  }

  // Every pending draft is its own row: these are the rows Sort offers, and a
  // thought split in two is two decisions still waiting.
  for (const draft of state.taskDrafts) {
    if (draft.status !== "pending") continue;
    spokenFor.add(draft.capture_item_id);
    const capture = capturesById.get(draft.capture_item_id);
    items.push(
      make({
        id: `draft:${draft.id}`,
        kind: "draft",
        rawTitle: draft.title,
        sourceText: capture?.raw_text ?? null,
        stage: "draft",
        areaId: draft.area_id,
        dueAt: draft.due_at,
        enteredAt: capture?.created_at ?? draft.created_at,
      }),
    );
  }

  const waitingIds = new Set(
    selectUnsortedCaptures(state).map((capture) => capture.id),
  );
  for (const capture of state.captureItems) {
    if (spokenFor.has(capture.id)) continue;
    const stage: EverythingStage = waitingIds.has(capture.id)
      ? "thought"
      : capture.status === "resolved"
        ? "sorted"
        : "letgo";
    items.push(
      make({
        id: `thought:${capture.id}`,
        kind: "thought",
        rawTitle: capture.raw_text,
        sourceText: null,
        stage,
        areaId: capture.area_id,
        dueAt: null,
        enteredAt: capture.created_at,
      }),
    );
  }

  return items;
}

function newestFirst(a: EverythingItem, b: EverythingItem): number {
  const diff = (timeOf(b.enteredAt) ?? 0) - (timeOf(a.enteredAt) ?? 0);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : 1;
}

function byDue(a: EverythingItem, b: EverythingItem): number {
  const dueA = timeOf(a.dueAt);
  const dueB = timeOf(b.dueAt);
  if (dueA !== null && dueB !== null && dueA !== dueB) return dueA - dueB;
  if (dueA !== null && dueB === null) return -1;
  if (dueA === null && dueB !== null) return 1;
  return newestFirst(a, b);
}

function groupByDue(items: EverythingItem[], now: Date): EverythingGroup[] {
  const order = [
    ["earlier", "Earlier"],
    ["today", "Today"],
    ["week", "Next 7 days"],
    ["later", "Later"],
    ["none", "No date"],
    ["closed", "Closed"],
  ] as const;
  const buckets = new Map<string, EverythingItem[]>();
  for (const item of items) {
    const due = timeOf(item.dueAt);
    let key: string;
    if (item.closed) key = "closed";
    else if (due === null) key = "none";
    else {
      const offset = dayOffset(due, now);
      key =
        offset < 0
          ? "earlier"
          : offset === 0
            ? "today"
            : offset <= 7
              ? "week"
              : "later";
    }
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return order
    .filter(([id]) => buckets.has(id))
    .map(([id, label]) => ({
      id,
      label,
      items: (buckets.get(id) ?? []).sort(byDue),
    }));
}

function groupByArea(
  items: EverythingItem[],
  areas: Phase2MockArea[],
): EverythingGroup[] {
  const groups: EverythingGroup[] = areas.map((area) => ({
    id: area.id,
    label: area.name,
    items: items.filter((item) => item.areaId === area.id),
  }));
  groups.push({
    id: "none",
    label: NO_AREA_NAME,
    items: items.filter((item) => item.areaId === null),
  });
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({ ...group, items: group.items.sort(byDue) }));
}

function groupByStage(items: EverythingItem[]): EverythingGroup[] {
  return EVERYTHING_STAGES.map((stage) => ({
    id: stage,
    label: EVERYTHING_STAGE_LABEL[stage],
    items: items.filter((item) => item.stage === stage).sort(byDue),
  })).filter((group) => group.items.length > 0);
}

function groupByEntered(items: EverythingItem[], now: Date): EverythingGroup[] {
  // Keyed by local day, so two rows of one day always share one group even
  // when their stored times are written in different shapes.
  const groups = new Map<number, EverythingGroup>();
  for (const item of [...items].sort(newestFirst)) {
    const ms = timeOf(item.enteredAt);
    const day = ms === null ? Number.NEGATIVE_INFINITY : startOfLocalDay(ms);
    const existing = groups.get(day);
    if (existing) existing.items.push(item);
    else {
      groups.set(day, {
        id: ms === null ? "unknown" : `day-${day}`,
        label: ms === null ? "Date unknown" : relativeDay(item.enteredAt, now),
        items: [item],
      });
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, group]) => group);
}

export function buildEverythingList(
  state: WorkflowState,
  filters: EverythingFilters,
  now: Date,
): EverythingList {
  const all = buildItems(state, now);
  const search = filters.search.trim().toLowerCase();

  // The area filter is a plain filter, not Start's area scope: it shows what
  // is filed under that area. Items with no area have their own choice.
  const visible = all.filter((item) => {
    if (!filters.showClosed && item.closed) return false;
    if (filters.areaId === EVERYTHING_NO_AREA) {
      if (item.areaId !== null) return false;
    } else if (filters.areaId && item.areaId !== filters.areaId) {
      return false;
    }
    if (filters.source === EVERYTHING_SOURCE_YOU) {
      if (item.source) return false;
    } else if (filters.source && item.source !== filters.source) {
      return false;
    }
    if (search && !item.title.toLowerCase().includes(search)) return false;
    return true;
  });

  const groups =
    filters.grouping === "area"
      ? groupByArea(visible, state.areas)
      : filters.grouping === "stage"
        ? groupByStage(visible)
        : filters.grouping === "entered"
          ? groupByEntered(visible, now)
          : groupByDue(visible, now);

  const open = all.filter((item) => !item.closed).length;
  return {
    total: all.length,
    open,
    closed: all.length - open,
    shown: visible.length,
    narrowed:
      search !== "" || filters.areaId !== null || filters.source !== null,
    hasNoAreaItems: all.some((item) => item.areaId === null),
    groups,
    sources: [
      ...new Set(
        all
          .map((item) => item.source)
          .filter((source): source is string => source !== null),
      ),
    ].sort((a, b) => a.localeCompare(b)),
  };
}
