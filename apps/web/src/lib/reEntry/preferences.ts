import { z } from "zod";
import type { WorkflowState } from "@/lib/workflow";
import { DEFAULT_RE_ENTRY_THRESHOLD_DAYS, type AbsenceResult } from "./detect";
import type { WhileYouWereOutSummary } from "./summary";
import type { ReEntryDeferralPlan, ReEntryDeferralOutcome } from "./defer";

export const RE_ENTRY_THRESHOLD_KEY = "lifeos.reentry.thresholdDays";
// A whole year is the upper bound for this day-based reminder setting.
export const MAX_RE_ENTRY_THRESHOLD_DAYS = 365;
export function validThreshold(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_RE_ENTRY_THRESHOLD_DAYS
  );
}
export function readReEntryThreshold(): number {
  try {
    const raw = window.localStorage.getItem(RE_ENTRY_THRESHOLD_KEY);
    const value = raw === null ? NaN : Number(raw);
    return validThreshold(value) ? value : DEFAULT_RE_ENTRY_THRESHOLD_DAYS;
  } catch {
    return DEFAULT_RE_ENTRY_THRESHOLD_DAYS;
  }
}
export function saveReEntryThreshold(value: number): boolean {
  if (!validThreshold(value)) return false;
  try {
    window.localStorage.setItem(RE_ENTRY_THRESHOLD_KEY, String(value));
    return true;
  } catch {
    return false;
  }
}

const iso = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const checkpointSchema = z.object({
  version: z.literal(1),
  scope: z.string().min(1),
  instanceId: z.string().min(1),
  openedAt: iso,
  absence: z.object({
    absent: z.literal(true),
    absenceDays: count,
    lastActivityAt: iso,
  }),
  summary: z.object({
    absenceDays: count,
    counts: z.object({
      lapsedBlocks: count,
      pendingTriage: count,
      activeTasks: count,
    }),
    lapsedBlocks: z.array(
      z.object({
        blockId: z.string(),
        taskId: z.string().nullable(),
        areaId: z.string(),
        taskTitle: z.string().nullable(),
        endAt: iso,
        googleEventId: z.string().nullable(),
      }),
    ),
    stalest: z
      .object({
        kind: z.enum(["task", "capture"]),
        id: z.string(),
        label: z.string(),
        ageDays: count,
      })
      .nullable(),
  }),
  plan: z.object({
    taskDeferrals: z.array(
      z.object({
        taskId: z.string(),
        areaId: z.string(),
        taskTitle: z.string().nullable(),
        blockIds: z.array(z.string()),
        lapsedBlockEndAts: z.array(iso),
      }),
    ),
    blockUnplans: z.array(
      z.object({
        blockId: z.string(),
        areaId: z.string(),
        taskId: z.string().nullable(),
        endAt: iso,
      }),
    ),
    requiresApproval: z.array(
      z.object({
        blockId: z.string(),
        taskId: z.string().nullable(),
        reason: z.enum(["google_backed_block", "task_has_google_backed_block"]),
      }),
    ),
  }),
  attempted: z.boolean(),
  demoMode: z.boolean(),
  outcomes: z.array(
    z.object({
      kind: z.enum(["task_to_backlog", "block_unplanned"]),
      subjectId: z.string(),
      ok: z.boolean(),
      error: z.string().nullable(),
    }),
  ),
  selectedTaskId: z.string().nullable(),
  edits: z.record(z.string()),
});
export interface ReturnCheckpoint {
  version: 1;
  scope: string;
  instanceId: string;
  openedAt: string;
  absence: AbsenceResult;
  summary: WhileYouWereOutSummary;
  plan: ReEntryDeferralPlan;
  attempted: boolean;
  demoMode: boolean;
  outcomes: ReEntryDeferralOutcome[];
  selectedTaskId: string | null;
  edits: Record<string, string>;
}
export function reEntryScope(state: WorkflowState): string {
  const ids = [
    ...state.tasks,
    ...state.captureItems,
    ...state.calendarBlocks,
    ...state.executionSessions,
  ].map((item) => item.user_id);
  // Persisted account rows take precedence over local/demo entity ids.
  return (
    ids.find((id) =>
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id),
    ) ??
    ids[0] ??
    "demo"
  );
}
function key(scope: string, kind: string): string {
  return `lifeos.moments.reentry.${encodeURIComponent(scope)}.${kind}`;
}
export function readReturnCheckpoint(scope: string): ReturnCheckpoint | null {
  try {
    const raw = window.localStorage.getItem(key(scope, "unfinished"));
    const parsed = checkpointSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success && parsed.data.scope === scope ? parsed.data : null;
  } catch {
    return null;
  }
}
export function writeReturnCheckpoint(checkpoint: ReturnCheckpoint): void {
  try {
    window.localStorage.setItem(
      key(checkpoint.scope, "unfinished"),
      JSON.stringify(checkpoint),
    );
  } catch {
    /* The active ritual still works with blocked storage. */
  }
}
export function clearReturnCheckpoint(scope: string): void {
  try {
    window.localStorage.removeItem(key(scope, "unfinished"));
  } catch {
    /* Device persistence is unavailable. */
  }
}
export function recordLocalReturnResolution(
  checkpoint: ReturnCheckpoint,
  resolution: {
    decision: "accepted" | "dismissed";
    taskId: string | null;
    firstStep: string | null;
    edited: boolean;
    resolvedAt: string;
  },
): void {
  // One bounded record per user/device, replaced at the next resolution.
  // This is local evidence, never an account delivery receipt or a journal.
  try {
    window.localStorage.setItem(
      key(checkpoint.scope, "lastResolution"),
      JSON.stringify({
        instanceId: checkpoint.instanceId,
        absence: checkpoint.absence,
        outcomes: checkpoint.outcomes,
        ...resolution,
        scope: "device_activation",
        accountSaveConfirmed: false,
      }),
    );
  } catch {
    /* Completion still works without storage. */
  }
}
export function readLastOpen(scope: string): string | null {
  try {
    const parsed = iso.safeParse(
      window.localStorage.getItem(key(scope, "lastOpen")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function recordLastOpen(scope: string, now: Date): void {
  try {
    window.localStorage.setItem(key(scope, "lastOpen"), now.toISOString());
  } catch {
    /* Never block the return. */
  }
}
