import type { Phase2TaskDraft } from "@lifeos/schemas";
import type { WorkflowState } from "@/lib/workflow";
import type {
  Phase2MockArea,
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "@/lib/types";
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
  done: Phase2MockTask[];
  sessions: Phase2MockExecutionSession[];
  counts: Record<(typeof PIPELINE_STAGES)[number], number>;
  overview: {
    area: Phase2MockArea;
    openCount: number;
    cardColor: string;
  }[];
}

function taskAreaMatches(task: { area_id: string }, areaId: string) {
  return task.area_id === areaId;
}

function blockHour(block: Phase2MockCalendarBlock) {
  return new Date(block.start_at).getHours();
}

export function buildCockpitViewModel(
  state: WorkflowState,
  selectedAreaId: string | null,
  dark: boolean,
): CockpitViewModel {
  const activeArea =
    state.areas.find((area) => area.id === selectedAreaId) ??
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
      block.status === "scheduled" &&
      block.area_id === areaId &&
      Boolean(block.task_id),
  );
  const planned = plannedBlocks
    .map((block) => {
      const task = state.tasks.find((item) => item.id === block.task_id);
      return task ? { task, block, hour: blockHour(block) } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.hour - b.hour);
  const sessions = state.executionSessions.filter(
    (session) => session.area_id === areaId,
  );

  return {
    activeArea,
    areas: state.areas,
    inbox,
    today,
    backlog,
    planned,
    done,
    sessions,
    counts: {
      today: today.length,
      capture: state.captureItems.filter((item) => item.area_id === areaId)
        .length,
      triage: inbox.length,
      plan: today.length,
      execute: planned.length,
      review: sessions.length,
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
            ["active", "backlog", "scheduled"].includes(task.status),
          ).length,
        cardColor: cardBg(area.color, {
          dark,
          sf2: dark ? "#1b1e25" : "#ffffff",
        }),
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
    default:
      return null;
  }
}
