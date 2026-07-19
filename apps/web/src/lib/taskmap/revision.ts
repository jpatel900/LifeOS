import type { DurationProfile } from "@lifeos/schemas";
import { applyStoredDuration } from "@/lib/learning/learningSurface";
import {
  computeCriticalPath,
  isNodeComplete,
  validateGraph,
  type TaskMapEdge,
  type TaskMapGraph,
  type TaskMapNode,
} from "./graph";

/**
 * FR-031 slice F5 (#679) — deterministic revision-eligibility kernel and
 * map diff for evidence-triggered map-revision proposals.
 *
 * The overplanning governor's revision loop is offered at exactly two
 * user-initiated points (post-node-completion write, and day/session Close)
 * and NEVER spends an AI call speculatively: this module is the pure,
 * code-only gate that runs BEFORE any offer renders. No signal here → no
 * offer → no AI spend. The AI is only called after the owner taps the offer
 * (on-demand-only, NFR-001/NFR-005), and even then it returns a full
 * candidate in the existing draft wire schema — the DIFF the owner reviews
 * is computed in code by `diffTaskMaps`, never asserted by the AI (the same
 * anti-hallucination doctrine as `computeCriticalPath`).
 *
 * Everything here is pure over explicit inputs (graph, evidence, "today"),
 * mirroring `timeline.ts` — no ambient clock, no storage, no fetches.
 */

/**
 * OWNER-GATE (#679, unresolved): at Close, one offer for the most-active
 * map (recommended default, built here) vs zero-by-default with a "review
 * maps" affordance. This named constant is the single knob: flipping it to
 * 0 disables the Close offer entirely without touching trigger wiring.
 */
export const CLOSE_REVISION_OFFER_LIMIT = 1;

/** One revision offer per task per calendar day (#679 cap). */
export const REVISION_OFFER_DAILY_CAP = 1;

/** Actual duration at or beyond this multiple of the expected duration is
 * drift evidence (#679: ">2x duration drift vs duration_profiles"). */
export const DURATION_DRIFT_MULTIPLE = 2;

export type RevisionSignalKind =
  | "out_of_order_completion"
  | "duration_drift"
  | "cut_scope"
  | "blocker";

export interface RevisionSignal {
  kind: RevisionSignalKind;
  /** The graph node the signal is about, when it is node-scoped. */
  nodeId?: string;
  /** One short, factual, non-shaming sentence — safe to show in the offer
   * card and to include as data in the revision prompt. */
  detail: string;
}

/**
 * One finished execution session's evidence, already reduced to plain
 * numbers by `buildRevisionEvidence` (or a test). `expectedMinutes` is the
 * duration_profiles-adjusted expectation when a learned profile applies,
 * else the planned estimate; null/absent means "no expectation, no drift
 * signal possible" — drift is never fabricated from missing data.
 */
export interface RevisionEvidenceSession {
  plannedMinutes: number | null;
  actualMinutes: number | null;
  expectedMinutes?: number | null;
  outcome:
    | "completed"
    | "partial"
    | "stopped"
    | "distracted"
    | "blocked"
    | "skipped";
  capOutcome?: "cut_scope" | "deferred" | null;
}

export interface RevisionEvidence {
  sessions: RevisionEvidenceSession[];
}

export interface RevisionEligibility {
  eligible: boolean;
  signals: RevisionSignal[];
}

const INELIGIBLE: RevisionEligibility = { eligible: false, signals: [] };

/**
 * The deterministic eligibility kernel (#679): decides from the approved
 * graph plus reduced execution evidence whether a revision offer may render
 * at all. Signals, in fixed order:
 *
 * 1. `out_of_order_completion` — a node LATER on the code-computed critical
 *    path is complete while an earlier one is not (the plan's order did not
 *    survive contact with reality).
 * 2. `duration_drift` — a session ran at ≥ `DURATION_DRIFT_MULTIPLE`× its
 *    expected minutes (profile-adjusted when a learned profile applied).
 * 3. `cut_scope` — a session ended in the FR-025 cut-scope outcome.
 * 4. `blocker` — a session ended blocked (the existing blocker signal;
 *    #679 non-goal: no new blocker plumbing).
 *
 * A structurally invalid graph fails closed to "not eligible" — a broken
 * map is a bug to surface elsewhere, never a reason to spend an AI call.
 */
export function revisionEligibility(
  graph: TaskMapGraph,
  evidence: RevisionEvidence,
): RevisionEligibility {
  if (!validateGraph(graph).valid) {
    return INELIGIBLE;
  }

  const signals: RevisionSignal[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  const criticalPath = computeCriticalPath(graph);
  let earliestIncompleteIndex = -1;
  for (let index = 0; index < criticalPath.length; index += 1) {
    const node = nodesById.get(criticalPath[index]!);
    if (!node) continue;
    if (!isNodeComplete(node) && earliestIncompleteIndex === -1) {
      earliestIncompleteIndex = index;
    } else if (isNodeComplete(node) && earliestIncompleteIndex !== -1) {
      signals.push({
        kind: "out_of_order_completion",
        nodeId: node.id,
        detail: `You finished "${node.title}" before an earlier step in the plan.`,
      });
    }
  }

  for (const session of evidence.sessions) {
    const expected =
      typeof session.expectedMinutes === "number"
        ? session.expectedMinutes
        : session.plannedMinutes;
    if (
      typeof expected === "number" &&
      Number.isFinite(expected) &&
      expected > 0 &&
      typeof session.actualMinutes === "number" &&
      Number.isFinite(session.actualMinutes) &&
      session.actualMinutes >= expected * DURATION_DRIFT_MULTIPLE
    ) {
      signals.push({
        kind: "duration_drift",
        detail: `A work session took ${Math.round(session.actualMinutes)} minutes instead of about ${Math.round(expected)}.`,
      });
    }
  }

  if (evidence.sessions.some((session) => session.capOutcome === "cut_scope")) {
    signals.push({
      kind: "cut_scope",
      detail: "You trimmed what this task needs to finish.",
    });
  }

  if (evidence.sessions.some((session) => session.outcome === "blocked")) {
    signals.push({
      kind: "blocker",
      detail: "A work session ended stuck on something outside the plan.",
    });
  }

  return signals.length > 0 ? { eligible: true, signals } : INELIGIBLE;
}

/**
 * Reduces one task's raw execution sessions to kernel evidence. Expected
 * minutes reuse the house duration_profiles lookup (`applyStoredDuration`,
 * same precedence as `timeline.ts`: learned profile adjusts the planned
 * estimate; no profile → the raw planned estimate; no estimate → no drift
 * check). Pure; callers with no profiles plumbed pass `[]`.
 */
export function buildRevisionEvidence(
  sessions: {
    planned_minutes: number | null;
    actual_minutes: number | null;
    outcome: RevisionEvidenceSession["outcome"];
    cap_outcome?: "cut_scope" | "deferred" | null;
  }[],
  profiles: DurationProfile[],
  areaId: string | null,
): RevisionEvidence {
  return {
    sessions: sessions.map((session) => {
      const planned = session.planned_minutes;
      const adjusted =
        typeof planned === "number" && Number.isFinite(planned) && planned > 0
          ? applyStoredDuration(profiles, areaId, planned)
          : null;
      return {
        plannedMinutes: planned,
        actualMinutes: session.actual_minutes,
        expectedMinutes: adjusted ?? planned,
        outcome: session.outcome,
        capOutcome: session.cap_outcome ?? null,
      };
    }),
  };
}

/**
 * Stable, order-insensitive fingerprint of an evidence signal set. Used for
 * "dismissal suppresses until NEW evidence": a dismissed offer's fingerprint
 * is stored, and only a signal set that fingerprints differently may offer
 * again. Deliberately coarse (kind + nodeId, not detail wording) so a
 * re-render or re-worded detail never counts as new evidence.
 */
export function evidenceFingerprint(signals: RevisionSignal[]): string {
  return [...signals]
    .map((signal) => `${signal.kind}:${signal.nodeId ?? "-"}`)
    .sort()
    .join("|");
}

export interface RevisionOfferRecord {
  /** ISO calendar date (YYYY-MM-DD) an offer was last shown for the task. */
  lastOfferedDate?: string | null;
  /** Fingerprint of the signal set the owner last dismissed. */
  dismissedFingerprint?: string | null;
}

export interface ShouldOfferRevisionInput {
  eligibility: RevisionEligibility;
  /** Today as an ISO calendar date (YYYY-MM-DD) — caller supplies it, no
   * ambient clock (mirrors `timeline.ts`). */
  todayIsoDate: string;
  /** The task's stored offer record, or null when none exists. */
  record: RevisionOfferRecord | null;
}

/**
 * The complete offer decision (#679): a signal must exist, at most
 * `REVISION_OFFER_DAILY_CAP` offer(s) render per task per calendar day, and
 * a dismissed signal set stays suppressed until the evidence fingerprint
 * changes. Pure — reads nothing, writes nothing.
 */
export function shouldOfferRevision(input: ShouldOfferRevisionInput): boolean {
  if (!input.eligibility.eligible) {
    return false;
  }

  if (
    REVISION_OFFER_DAILY_CAP <= 1 &&
    input.record?.lastOfferedDate === input.todayIsoDate
  ) {
    return false;
  }

  if (
    input.record?.dismissedFingerprint &&
    input.record.dismissedFingerprint ===
      evidenceFingerprint(input.eligibility.signals)
  ) {
    return false;
  }

  return true;
}

export interface TaskMapNodeChange {
  before: TaskMapNode;
  after: TaskMapNode;
}

export interface TaskMapDiff {
  addedNodes: TaskMapNode[];
  removedNodes: TaskMapNode[];
  changedNodes: TaskMapNodeChange[];
  /** Ids present in both graphs with no meaningful change — the ones the
   * diff-mode review renders dimmed. */
  unchangedNodeIds: string[];
  addedEdges: TaskMapEdge[];
  removedEdges: TaskMapEdge[];
  /** True when the candidate proposes no meaningful change at all. */
  identical: boolean;
}

function nodeMeaningfullyChanged(before: TaskMapNode, after: TaskMapNode) {
  return (
    before.title !== after.title ||
    before.role !== after.role ||
    (before.red_reason ?? null) !== (after.red_reason ?? null) ||
    (before.red_condition ?? null) !== (after.red_condition ?? null) ||
    (before.estimated_minutes ?? null) !== (after.estimated_minutes ?? null) ||
    (before.two_minute_move === true) !== (after.two_minute_move === true)
  );
}

/**
 * Code-computed diff between the approved map and an AI candidate (#679):
 * the AI returns a FULL candidate graph in the existing wire schema and
 * this function — never the AI — decides what changed. Completion state
 * (`done`/`completed_at`) is deliberately NOT a diffable field: the AI
 * never sets it and `carryForwardNodeCompletion` re-applies it on approve,
 * so a candidate that only differs in completion state is `identical`.
 * Ordering is deterministic: nodes/edges follow the candidate's order for
 * additions/changes and the current graph's order for removals.
 */
export function diffTaskMaps(
  current: TaskMapGraph,
  candidate: TaskMapGraph,
): TaskMapDiff {
  const currentById = new Map(current.nodes.map((node) => [node.id, node]));
  const candidateById = new Map(candidate.nodes.map((node) => [node.id, node]));

  const addedNodes = candidate.nodes.filter(
    (node) => !currentById.has(node.id),
  );
  const removedNodes = current.nodes.filter(
    (node) => !candidateById.has(node.id),
  );
  const changedNodes: TaskMapNodeChange[] = [];
  const unchangedNodeIds: string[] = [];

  for (const node of candidate.nodes) {
    const before = currentById.get(node.id);
    if (!before) continue;
    if (nodeMeaningfullyChanged(before, node)) {
      changedNodes.push({ before, after: node });
    } else {
      unchangedNodeIds.push(node.id);
    }
  }

  const edgeKey = (edge: TaskMapEdge) => `${edge.from}->${edge.to}`;
  const currentEdgeKeys = new Set(current.edges.map(edgeKey));
  const candidateEdgeKeys = new Set(candidate.edges.map(edgeKey));
  const addedEdges = candidate.edges.filter(
    (edge) => !currentEdgeKeys.has(edgeKey(edge)),
  );
  const removedEdges = current.edges.filter(
    (edge) => !candidateEdgeKeys.has(edgeKey(edge)),
  );

  return {
    addedNodes,
    removedNodes,
    changedNodes,
    unchangedNodeIds,
    addedEdges,
    removedEdges,
    identical:
      addedNodes.length === 0 &&
      removedNodes.length === 0 &&
      changedNodes.length === 0 &&
      addedEdges.length === 0 &&
      removedEdges.length === 0,
  };
}

export interface MostActiveMapCandidate {
  taskId: string;
  graph: TaskMapGraph;
  /** Completed/missed calendar blocks for the task today — the caller
   * derives this from existing state (no new plumbing). */
  blocksTodayCount: number;
}

function nodesCompletedOn(graph: TaskMapGraph, todayIsoDate: string): number {
  return graph.nodes.filter(
    (node) =>
      typeof node.completed_at === "string" &&
      node.completed_at.startsWith(todayIsoDate),
  ).length;
}

/**
 * Picks the most-active approved map among candidates for the single Close
 * offer (#679 recommended default): most map nodes completed today, then
 * most completed/missed blocks today, then lowest task id — fully
 * deterministic. Returns null for no candidates or when nothing shows any
 * activity today (a Close with zero map activity has no "most active" map
 * to speak about, so no offer is fabricated).
 */
export function mostActiveMapTaskId(
  candidates: MostActiveMapCandidate[],
  todayIsoDate: string,
): string | null {
  const scored = candidates
    .map((candidate) => ({
      taskId: candidate.taskId,
      completedToday: nodesCompletedOn(candidate.graph, todayIsoDate),
      blocksToday: candidate.blocksTodayCount,
    }))
    .filter((entry) => entry.completedToday > 0 || entry.blocksToday > 0)
    .sort(
      (left, right) =>
        right.completedToday - left.completedToday ||
        right.blocksToday - left.blocksToday ||
        (left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0),
    );

  return scored[0]?.taskId ?? null;
}
