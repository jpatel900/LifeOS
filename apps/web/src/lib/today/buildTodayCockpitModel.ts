export type TodayHealthState = "ok" | "attention" | "unavailable";

export interface TodayCockpitTask {
  id: string;
  title: string;
  status: string;
}

export interface TodayCockpitDraft {
  id: string;
  title: string;
  kind: "task" | "project";
}

export interface TodayCockpitProposal {
  id: string;
  taskId: string | null;
  status: string;
}

export interface TodayCockpitBlock {
  id: string;
  taskId: string | null;
  startAt: string;
  endAt: string;
  status: string;
}

export interface TodayCockpitSession {
  id: string;
  taskId: string | null;
  calendarBlockId: string | null;
  status?: string;
  outcome?: string;
}

export interface BuildTodayCockpitModelInput {
  now?: Date;
  timezone?: string;
  tasks: TodayCockpitTask[];
  drafts: TodayCockpitDraft[];
  proposals: TodayCockpitProposal[];
  blocks: TodayCockpitBlock[];
  sessions: TodayCockpitSession[];
  health?: {
    state: TodayHealthState;
    summary?: string;
  };
  dataDegraded?: boolean;
}

export interface TodayCockpitModel {
  now: {
    title: string;
    summary: string;
    href: "/execute";
    kind: "session" | "block" | "empty";
  };
  next: {
    kind:
      | "recovery"
      | "needs_decision"
      | "current_work"
      | "unplanned_task"
      | "capture"
      | "health_attention";
    label: string;
    reason: string;
    href: "/capture" | "/triage" | "/calendar" | "/execute" | "/health";
  };
  needsDecision: {
    count: number;
    items: TodayCockpitDraft[];
  };
  unplanned: {
    title: "Unplanned tasks" | "Active tasks";
    items: TodayCockpitTask[];
  };
  todayBlocks: TodayCockpitBlock[];
  recoveryItems: Array<{
    id: string;
    label: string;
    reason: string;
  }>;
  systemStatus: {
    state: TodayHealthState;
    summary: string;
    href: "/health";
  };
  dataDegraded: boolean;
}

const ACTIVE_PROPOSAL_STATUSES = new Set(["proposed", "edited", "accepted"]);
const ACTIVE_BLOCK_STATUSES = new Set(["scheduled", "running"]);
const TODAY_BLOCK_STATUSES = new Set([
  "scheduled",
  "running",
  "missed",
  "completed",
]);
const RECOVERY_SESSION_STATUSES = new Set(["missed", "stuck", "distracted"]);
const RECOVERY_OUTCOMES = new Set(["blocked", "skipped", "distracted"]);

function getRuntimeLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createCalendarDateKeyGetter(timezone?: string) {
  if (!timezone) {
    return (value: Date) => getRuntimeLocalDateKey(value);
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (value: Date) => {
    const parts = formatter.formatToParts(value);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
      return getRuntimeLocalDateKey(value);
    }

    return `${year}-${month}-${day}`;
  };
}

function normalizeSessionStatus(session: TodayCockpitSession) {
  if (session.status === "running" || session.status === "paused") {
    return session.status;
  }

  if (session.outcome === "partial") {
    return "running";
  }

  return null;
}

function isRecoverySession(session: TodayCockpitSession) {
  if (session.status && RECOVERY_SESSION_STATUSES.has(session.status)) {
    return true;
  }

  if (session.outcome && RECOVERY_OUTCOMES.has(session.outcome)) {
    return true;
  }

  return false;
}

export function buildTodayCockpitModel(
  input: BuildTodayCockpitModelInput,
): TodayCockpitModel {
  const now = input.now ?? new Date();
  const getCalendarDateKey = createCalendarDateKeyGetter(input.timezone);
  const todayDateKey = getCalendarDateKey(now);

  const taskById = new Map(input.tasks.map((task) => [task.id, task] as const));
  const needsDecisionItems = input.drafts.slice(0, 3);

  const activeProposalTaskIds = new Set(
    input.proposals
      .filter(
        (proposal) =>
          proposal.taskId && ACTIVE_PROPOSAL_STATUSES.has(proposal.status),
      )
      .map((proposal) => proposal.taskId as string),
  );
  const activeBlockTaskIds = new Set(
    input.blocks
      .filter(
        (block) => block.taskId && ACTIVE_BLOCK_STATUSES.has(block.status),
      )
      .map((block) => block.taskId as string),
  );

  const unplannedTasks = input.tasks.filter(
    (task) =>
      task.status === "active" &&
      !activeProposalTaskIds.has(task.id) &&
      !activeBlockTaskIds.has(task.id),
  );

  const todayBlocks = input.blocks
    .filter(
      (block) =>
        TODAY_BLOCK_STATUSES.has(block.status) &&
        getCalendarDateKey(new Date(block.startAt)) === todayDateKey,
    )
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

  const recoveryItems: TodayCockpitModel["recoveryItems"] = [];
  const recoveryKeys = new Set<string>();

  for (const session of input.sessions) {
    if (!isRecoverySession(session)) {
      continue;
    }

    const task = session.taskId ? taskById.get(session.taskId) : null;
    const key = `${session.taskId ?? "no-task"}:${session.status ?? session.outcome ?? "unknown"}`;
    if (recoveryKeys.has(key)) {
      continue;
    }
    recoveryKeys.add(key);
    recoveryItems.push({
      id: session.id,
      label: task?.title ?? "Recover interrupted work",
      reason: "Recent session ended as missed, stuck, or distracted.",
    });
  }

  for (const block of input.blocks) {
    if (block.status !== "missed") {
      continue;
    }

    const task = block.taskId ? taskById.get(block.taskId) : null;
    const key = `block:${block.id}`;
    if (recoveryKeys.has(key)) {
      continue;
    }
    recoveryKeys.add(key);
    recoveryItems.push({
      id: block.id,
      label: task?.title ?? "Recover missed block",
      reason: "A planned block was missed and needs a next step.",
    });
  }

  const currentSession = input.sessions.find((session) => {
    const status = normalizeSessionStatus(session);
    return status === "running" || status === "paused";
  });
  const currentBlock = input.blocks.find((block) => block.status === "running");
  const currentSessionTask = currentSession?.taskId
    ? taskById.get(currentSession.taskId)
    : null;
  const currentBlockTask = currentBlock?.taskId
    ? taskById.get(currentBlock.taskId)
    : null;

  const nowSection: TodayCockpitModel["now"] = currentSession
    ? {
        kind: "session",
        title: currentSessionTask?.title ?? "Current session",
        summary:
          normalizeSessionStatus(currentSession) === "paused"
            ? "Paused right now. Resume or choose the next end outcome."
            : "In progress now. Stay with this before starting something else.",
        href: "/execute",
      }
    : currentBlock
      ? {
          kind: "block",
          title: currentBlockTask?.title ?? "Current block",
          summary: "A planned block is running now.",
          href: "/execute",
        }
      : {
          kind: "empty",
          title: "Nothing is running right now.",
          summary: "Start from Next to choose one useful move.",
          href: "/execute",
        };

  const isEmpty =
    needsDecisionItems.length === 0 &&
    unplannedTasks.length === 0 &&
    todayBlocks.length === 0 &&
    recoveryItems.length === 0 &&
    !currentSession &&
    !currentBlock;

  const healthState = input.health?.state ?? "unavailable";
  const healthSummary =
    input.health?.summary ??
    (healthState === "attention"
      ? "System status needs attention."
      : healthState === "ok"
        ? "System status looks healthy."
        : "System status is not loaded here. Open Health to run a check.");

  let next: TodayCockpitModel["next"];
  if (recoveryItems.length > 0) {
    next = {
      kind: "recovery",
      label: "Recover interrupted work",
      reason: recoveryItems[0].reason,
      href: "/execute",
    };
  } else if (needsDecisionItems.length > 0) {
    next = {
      kind: "needs_decision",
      label: "Review pending decisions",
      reason: "Drafts are waiting for accept or reject in Triage.",
      href: "/triage",
    };
  } else if (nowSection.kind !== "empty") {
    next = {
      kind: "current_work",
      label: "Continue current work",
      reason: "A session or block is already in progress.",
      href: "/execute",
    };
  } else if (unplannedTasks.length > 0) {
    next = {
      kind: "unplanned_task",
      label: "Plan one active task",
      reason: "Active tasks exist without an active proposal or running block.",
      href: "/calendar",
    };
  } else if (isEmpty || Boolean(input.dataDegraded)) {
    next = {
      kind: "capture",
      label: "Capture what matters now",
      reason: input.dataDegraded
        ? "Saved workspace data is partial, so start with a fresh capture."
        : "No pending workflow state is loaded yet.",
      href: "/capture",
    };
  } else if (healthState === "attention") {
    next = {
      kind: "health_attention",
      label: "Review system status",
      reason: healthSummary,
      href: "/health",
    };
  } else {
    next = {
      kind: "capture",
      label: "Capture what matters now",
      reason: "Capture is the quickest way to create the next actionable item.",
      href: "/capture",
    };
  }

  return {
    now: nowSection,
    next,
    needsDecision: {
      count: input.drafts.length,
      items: needsDecisionItems,
    },
    unplanned: {
      title: input.tasks.some((task) => task.status === "active")
        ? "Unplanned tasks"
        : "Active tasks",
      items: unplannedTasks.slice(0, 4),
    },
    todayBlocks,
    recoveryItems: recoveryItems.slice(0, 4),
    systemStatus: {
      state: healthState,
      summary: healthSummary,
      href: "/health",
    },
    dataDegraded: Boolean(input.dataDegraded),
  };
}
