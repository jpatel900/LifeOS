import type { Phase2TaskDraft, Phase2TimeBlockProposal } from "@lifeos/schemas";
import type { WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
import {
  findAgingWaitingOnItems,
  findOpenCommitments,
  summarizeAging,
  type AgingRulesOptions,
  type AgingSummary,
  type AgingWaitingOnItem,
} from "@/lib/agingRules";
import { cardBg } from "./accent";
import { resolveSelectedArea } from "@/lib/areaAccent";
import { selectUnsortedCaptures } from "@/lib/workflow/captureStatus";
import { selectTasksToPlace } from "@/lib/workflow/planStatus";
import {
  selectNeedsDecision,
  type ReviewQueueItem,
} from "@/lib/workflow/reviewStatus";

export type CockpitStage =
  | "today"
  | "capture"
  | "triage"
  | "plan"
  | "execute"
  | "review"
  | "health"
  | "overview";

export const PIPELINE_STAGES = [
  "today",
  "capture",
  "triage",
  "plan",
  "execute",
  "review",
] as const satisfies readonly CockpitStage[];

export interface CockpitViewModel {
  activeArea: Phase2MockArea;
  areas: Phase2MockArea[];
  inbox: Phase2TaskDraft[];
  today: Phase2MockTask[];
  backlog: Phase2MockTask[];
  planned: {
    task: Phase2MockTask;
    block: Phase2MockCalendarBlock;
    hour: number;
  }[];
  proposals: {
    allDayContexts: {
      date: string;
      endDate: string;
      id: string;
      summary: string;
    }[];
    proposal: Phase2TimeBlockProposal;
    task: Phase2MockTask;
    hour: number;
  }[];
  done: Phase2MockTask[];
  sessions: Phase2MockExecutionSession[];
  healthChecks: WorkflowState["healthChecks"];
  /**
   * C2-S3: the shape and the rule now live in
   * `lib/workflow/reviewStatus.ts` — the shared "needs a decision" definition
   * every review surface counts and lists from.
   */
  reviewQueue: ReviewQueueItem[];
  /** S4 (#256): rule-based waiting-on aging, scoped to the active area. */
  agingWaitingOn: AgingWaitingOnItem<Phase2MockTask>[];
  /** S4 (#256): open commitments owed by the user, oldest first, scoped to the active area. */
  openCommitments: Phase2MockTask[];
  /** S4 (#256): rule-based counts for the health surface, scoped to the active area. */
  agingSummary: AgingSummary;
  global: {
    inbox: PipelineCard[];
    today: PipelineCard[];
    planned: PipelineCard[];
    done: PipelineCard[];
  };
  counts: Record<(typeof PIPELINE_STAGES)[number], number>;
  overview: {
    area: Phase2MockArea;
    openCount: number;
    cardColor: string;
  }[];
}

export interface PipelineCard {
  id: string;
  title: string;
  area: Phase2MockArea;
  cardColor: string;
}

function taskAreaMatches(task: { area_id: string }, areaId: string) {
  return task.area_id === areaId;
}

function blockHour(block: Phase2MockCalendarBlock) {
  return new Date(block.start_at).getHours();
}

function areaForId(areas: Phase2MockArea[], areaId: string) {
  return areas.find((area) => area.id === areaId) ?? null;
}

function cardColorFor(area: Phase2MockArea, dark: boolean) {
  return cardBg(area.color, {
    dark,
    sf2: dark ? "#1b1e25" : "#ffffff",
  });
}

function allDayContextsForProposal(proposal: Phase2TimeBlockProposal) {
  const details = (proposal as { conflict_details_json?: unknown })
    .conflict_details_json;
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return [];
  }

  const contexts = (details as Record<string, unknown>).all_day_contexts;
  if (!Array.isArray(contexts)) return [];

  return contexts
    .map((context) => {
      if (!context || typeof context !== "object" || Array.isArray(context)) {
        return null;
      }
      const item = context as Record<string, unknown>;
      return typeof item.date === "string" &&
        typeof item.endDate === "string" &&
        typeof item.id === "string" &&
        typeof item.summary === "string"
        ? {
            date: item.date,
            endDate: item.endDate,
            id: item.id,
            summary: item.summary,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function makePipelineCard(
  item: { id: string; title: string; area_id: string },
  areas: Phase2MockArea[],
  dark: boolean,
): PipelineCard | null {
  const area = areaForId(areas, item.area_id);
  if (!area) return null;
  return {
    id: item.id,
    title: item.title,
    area,
    cardColor: cardColorFor(area, dark),
  };
}

export function buildCockpitViewModel(
  state: WorkflowState,
  selectedAreaId: string | null,
  dark: boolean,
  agingOptions: AgingRulesOptions = {},
): CockpitViewModel {
  // C2-S2 / FINDING 3: the Plan chip is now day-scoped, so it needs a clock.
  // Reuses the options bag the aging rules already inject `now` through
  // (`AgingRulesOptions.now`) rather than adding a second clock parameter, so
  // every existing caller and test keeps its single source of "now".
  const now = agingOptions.now ?? new Date();
  // #691: ONE active-area resolver shared with the moments home's accent
  // derivation (#701) — this used to be an inline second copy of the same
  // `find ?? areas[0]` rule, which is exactly how two screens drift apart.
  // Note this is the *data/accent* fallback: with nothing selected ("All
  // areas") it still lands on the first area, while the pickers and badges
  // read `selectedAreaId` directly so none of them claims an area is
  // current. A true all-areas cockpit data view is the open AGENT-TODO.
  const activeArea = resolveSelectedArea(state.areas, selectedAreaId) ?? {
    id: "area-default",
    user_id: "local",
    name: "LifeOS",
    color: "#6b78e8",
    created_at: new Date(0).toISOString(),
  };
  const areaId = activeArea.id;
  const inbox = state.taskDrafts.filter(
    (draft) => draft.status === "pending" && draft.area_id === areaId,
  );
  const today = state.tasks.filter(
    (task) => task.status === "active" && taskAreaMatches(task, areaId),
  );
  const backlog = state.tasks.filter(
    (task) => task.status === "backlog" && taskAreaMatches(task, areaId),
  );
  const done = state.tasks.filter(
    (task) => task.status === "done" && taskAreaMatches(task, areaId),
  );
  const plannedBlocks = state.calendarBlocks.filter(
    (block) =>
      ["scheduled", "running"].includes(block.status) &&
      block.area_id === areaId &&
      Boolean(block.task_id),
  );
  const planned = plannedBlocks
    .map((block) => {
      const task = state.tasks.find(
        (item) => item.id === block.task_id && item.status === "scheduled",
      );
      return task ? { task, block, hour: blockHour(block) } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.hour - b.hour);
  const proposals = state.timeBlockProposals
    .filter(
      (proposal) =>
        proposal.area_id === areaId &&
        ["proposed", "edited"].includes(proposal.status),
    )
    .map((proposal) => {
      const task = state.tasks.find(
        (item) =>
          item.id === proposal.task_id &&
          ["active", "scheduled"].includes(item.status),
      );
      // #580 (one planning model): `hasExistingBlock` and its "accepting
      // adds another block" warning are gone — placement supersedes pending
      // proposals atomically, so a task can never simultaneously hold an
      // active proposal and a scheduled block.
      return task
        ? {
            allDayContexts: allDayContextsForProposal(proposal),
            proposal,
            task,
            hour: new Date(proposal.proposed_start).getHours(),
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.hour - b.hour);
  const sessions = state.executionSessions.filter(
    (session) => session.area_id === areaId,
  );
  // C2-S3 / FINDING 5: one definition, shared with every review surface.
  // The count a surface prints and the list it renders are the same array.
  const reviewQueue = selectNeedsDecision(state, areaId);
  const globalPlannedBlocks = state.calendarBlocks.filter(
    (block) => ["scheduled", "running"].includes(block.status) && block.task_id,
  );
  const global = {
    inbox: state.taskDrafts
      .filter((draft) => draft.status === "pending")
      .map((draft) => makePipelineCard(draft, state.areas, dark))
      .filter((item): item is PipelineCard => Boolean(item)),
    today: state.tasks
      .filter((task) => task.status === "active")
      .map((task) => makePipelineCard(task, state.areas, dark))
      .filter((item): item is PipelineCard => Boolean(item)),
    planned: globalPlannedBlocks
      .map((block) => {
        const task = state.tasks.find(
          (item) => item.id === block.task_id && item.status === "scheduled",
        );
        return task ? makePipelineCard(task, state.areas, dark) : null;
      })
      .filter((item): item is PipelineCard => Boolean(item)),
    done: state.tasks
      .filter((task) => task.status === "done")
      .map((task) => makePipelineCard(task, state.areas, dark))
      .filter((item): item is PipelineCard => Boolean(item)),
  };

  const areaTasksForAging = state.tasks.filter((task) =>
    taskAreaMatches(task, areaId),
  );
  const agingWaitingOn = findAgingWaitingOnItems(
    areaTasksForAging,
    agingOptions,
  );
  const openCommitments = findOpenCommitments(areaTasksForAging);
  const agingSummary = summarizeAging(areaTasksForAging, agingOptions);

  return {
    activeArea,
    areas: state.areas,
    inbox,
    today,
    backlog,
    planned,
    proposals,
    done,
    sessions,
    healthChecks: state.healthChecks,
    reviewQueue,
    agingWaitingOn,
    openCommitments,
    agingSummary,
    global,
    counts: {
      today: today.length,
      // C2-S2 / FINDING 4 (#687 C2-S1 inventory): this filtered by AREA ONLY.
      // It counted resolved, archived and composted thoughts as still waiting,
      // and it counted a thought an accepted task already came from. Both are
      // the exact lies `lib/workflow/captureStatus` exists to make impossible,
      // and the extra `status === "new"` narrowing is the moments Capture
      // badge's own long-standing semantics (`pipelineCounts.ts`): once a
      // thought is sorted it is counted by Triage instead, never twice. Pinned
      // by `lib/workflow/captureStatus.test.ts`'s UNSORTED_SURFACES table, so
      // this chip can never drift away from the other five surfaces again.
      capture: selectUnsortedCaptures(state, areaId).filter(
        (item) => item.status === "new",
      ).length,
      triage: inbox.length,
      // C2-S2 / FINDING 3 (#687 C2-S1 inventory): this was `today.length` —
      // the ACTIVE-task count under a label that reads as "things planned".
      // The inventory ratified `pipelineCounts.ts`'s semantics as the truthful
      // ones: what is left TO plan is an active task that does not already
      // hold an open block on today's rail. Same shape as
      // `selectTasksToPlace` — the ONE definition, shared with the moments
      // Plan badge and the ported Plan sheet's own list, so none of the three
      // can drift (pinned by `lib/workflow/planStatus.test.ts` and
      // `__tests__/cockpitStageChipTruth.test.ts`).
      plan: selectTasksToPlace(state, areaId, now).length,
      // Deliberately unchanged by this slice: `execute` is day-unscoped but
      // does count blocks (the inventory called it "roughly honest"), and
      // `review`'s disagreement with `/review`'s own headline is FINDING 5,
      // which belongs to the C2-S3 Review port, not here.
      execute: planned.length,
      review: reviewQueue.length + sessions.length,
    },
    overview: state.areas.map((area) => {
      const areaTasks = state.tasks.filter((task) => task.area_id === area.id);
      const areaInbox = state.taskDrafts.filter(
        (draft) => draft.status === "pending" && draft.area_id === area.id,
      );
      return {
        area,
        openCount:
          areaInbox.length +
          areaTasks.filter((task) =>
            ["active", "backlog", "scheduled", "blocked"].includes(task.status),
          ).length,
        cardColor: cardColorFor(area, dark),
      };
    }),
  };
}

export function stageForPathname(pathname: string | null): CockpitStage | null {
  switch (pathname) {
    case "/":
      return "today";
    case "/capture":
      return "capture";
    case "/triage":
      return "triage";
    case "/calendar":
      return "plan";
    case "/execute":
      return "execute";
    case "/review":
      return "review";
    case "/health":
      return "health";
    case "/areas":
      return "overview";
    default:
      return null;
  }
}
