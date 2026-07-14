import type { WorkflowState } from "@/lib/workflow";
import { buildTodayBlocks, findBlockByState, type NowOption } from "./shared";

/**
 * Moments pass P1 — packet: Flow moment view model.
 *
 * Pure selector, no fetches/writes — same contract as `start.ts`/`close.ts`.
 */

export interface FlowVM {
  currentBlock: {
    title: string;
    areaLabel: string;
    startAt: string;
    endAt: string | null;
  } | null;
  drift: { minutes: number; reason: string } | null;
}

/**
 * Flow moment view model — the in-progress block and drift signal. Drift
 * has no minutes source in v0 (no drift-tracking data exists yet); `0` is
 * the truthful placeholder, not a real duration, whenever the most recent
 * execution session reports stuck/missed/distracted.
 */
export function buildFlowVM(state: WorkflowState, options: NowOption): FlowVM {
  const { now } = options;
  const blocks = buildTodayBlocks(state, now);
  const nowBlock = findBlockByState(blocks, "now");

  const currentBlock = nowBlock
    ? {
        title: nowBlock.title,
        areaLabel: nowBlock.meta,
        startAt: nowBlock.startAt,
        endAt: nowBlock.endAt,
      }
    : null;

  const latestSession = state.executionSessions[0];
  const driftReasons = new Set(["stuck", "missed", "distracted"]);
  const drift =
    latestSession && driftReasons.has(latestSession.status)
      ? { minutes: 0, reason: latestSession.status }
      : null;

  return { currentBlock, drift };
}
