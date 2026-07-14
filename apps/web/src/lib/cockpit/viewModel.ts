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
    hasExistingBlock: boolean;
  }[];
  done: Phase2MockTask[];
  sessions: Phase2MockExecutionSession[];
  healthChecks: WorkflowState["healthChecks"];
  reviewQueue: {
    task: Phase2MockTask;
    block: Phase2MockCalendarBlock | null;
    session: Phase2MockExecutionSession | null;
    reason: "open" | "backlog" | "stuck" | "missed" | "partial";
  }[];
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

function uniqueReviewItems(
  items: CockpitViewModel["reviewQueue"],
): CockpitViewModel["reviewQueue"] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.task.id)) return false;
    seen.add(item.task.id);
    return true;
  });
}

export function buildCockpitViewModel(
  state: WorkflowState,
  selectedAreaId: string | null,
  dark: boolean,
  agingOptions: AgingRulesOptions = {},
): CockpitViewModel {
  const activeArea = state.areas.find((area) => area.id === selectedAreaId) ??
    state.areas[0] ?? {
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
      return task
        ? {
            allDayContexts: allDayContextsForProposal(proposal),
            proposal,
            task,
            hour: new Date(proposal.proposed_start).getHours(),
            hasExistingBlock: plannedBlocks.some(
              (block) => block.task_id === task.id,
            ),
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.hour - b.hour);
  const sessions = state.executionSessions.filter(
    (session) => session.area_id === areaId,
  );
  const reviewQueue = uniqueReviewItems([
    ...state.executionSessions
      .filter(
        (session) =>
          session.area_id === areaId &&
          [
            "stuck",
            "missed",
            "stopped",
            "distracted",
            "partial",
            "skipped",
          ].includes(session.status),
      )
      .map((session) => {
        const task = state.tasks.find((item) => item.id === session.task_id);
        const block =
          state.calendarBlocks.find(
            (item) => item.id === session.calendar_block_id,
          ) ?? null;
        if (!task) return null;
        return {
          task,
          block,
          session,
          reason:
            session.status === "missed" || session.status === "skipped"
              ? ("missed" as const)
              : session.status === "partial"
                ? ("partial" as const)
                : ("stuck" as const),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ...state.calendarBlocks
      .filter((block) => block.area_id === areaId && block.status === "missed")
      .map((block) => {
        const task = state.tasks.find((item) => item.id === block.task_id);
        if (!task) return null;
        return {
          task,
          block,
          session:
            state.executionSessions.find(
              (session) => session.calendar_block_id === block.id,
            ) ?? null,
          reason: "missed" as const,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    ...state.tasks
      .filter((task) => task.area_id === areaId && task.status === "blocked")
      .map((task) => ({
        task,
        block:
          state.calendarBlocks.find((block) => block.task_id === task.id) ??
          null,
        session:
          state.executionSessions.find(
            (session) => session.task_id === task.id,
          ) ?? null,
        reason: "stuck" as const,
      })),
    ...today.map((task) => ({
      task,
      block: null,
      session: null,
      reason: "open" as const,
    })),
    ...backlog.map((task) => ({
      task,
      block: null,
      session: null,
      reason: "backlog" as const,
    })),
  ]);
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
      capture: state.captureItems.filter((item) => item.area_id === areaId)
        .length,
      triage: inbox.length,
      plan: today.length,
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
