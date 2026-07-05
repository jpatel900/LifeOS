"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowState } from "@/lib/workflow";
import {
  detectAbsence,
  latestActivityTimestamp,
  type AbsenceResult,
} from "@/lib/reEntry/detect";
import {
  buildWhileYouWereOutSummary,
  type WhileYouWereOutSummary,
} from "@/lib/reEntry/summary";
import {
  executeReEntryDeferrals,
  planReEntryDeferrals,
  type ReEntryDeferralOutcome,
  type ReEntryDeferralPlan,
} from "@/lib/reEntry/defer";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * FR-028 re-entry amnesty, packet F-G2c: the client-side ritual state
 * machine wiring the pure reEntry lib (F-G2a/F-G2b) to a live WorkflowState.
 *
 * The ritual's summary/plan/absence are latched once on the render where the
 * absence first becomes eligible (not suppressed) and never recomputed after
 * — the auto-defer batch mutates persisted rows via
 * `refreshPersistedWorkflow`, which brings fresh `updated_at` timestamps back
 * into `state`. Re-deriving `detectAbsence` from live state post-refresh
 * would flip `absent` back to false mid-ritual and yank it off screen, so
 * everything downstream of "eligible" reads from refs/state captured at
 * latch time, never from the live `state` prop again.
 */

const SUPPRESSION_KEY = "lifeos.moments.reentry";

interface SuppressionRecord {
  completedForLastActivityAt: string;
}

function readSuppression(): SuppressionRecord | null {
  try {
    const raw = window.localStorage.getItem(SUPPRESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SuppressionRecord;
  } catch {
    return null;
  }
}

function writeSuppression(record: SuppressionRecord): void {
  try {
    window.localStorage.setItem(SUPPRESSION_KEY, JSON.stringify(record));
  } catch {
    // Blocked storage (private mode, quota, etc.) — suppression just won't persist.
  }
}

export type ReEntryRitualStatus =
  | "idle"
  | "pending"
  | "deferring"
  | "ready"
  | "done";

export interface UseReEntryRitualInput {
  state: WorkflowState;
  now: Date;
  enabled?: boolean;
  refreshPersistedWorkflow?: () => Promise<void>;
}

export interface UseReEntryRitualResult {
  status: ReEntryRitualStatus;
  summary: WhileYouWereOutSummary | null;
  plan: ReEntryDeferralPlan | null;
  outcomes: ReEntryDeferralOutcome[];
  demoMode: boolean;
  complete(): void;
}

interface LatchedRitual {
  absence: AbsenceResult;
  summary: WhileYouWereOutSummary;
  plan: ReEntryDeferralPlan;
}

export function useReEntryRitual(
  input: UseReEntryRitualInput,
): UseReEntryRitualResult {
  const { state, now, enabled = true, refreshPersistedWorkflow } = input;

  const [status, setStatus] = useState<ReEntryRitualStatus>("idle");
  const [outcomes, setOutcomes] = useState<ReEntryDeferralOutcome[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [latched, setLatched] = useState<LatchedRitual | null>(null);

  const executedRef = useRef(false);

  // Latch decision: computed from live state only while nothing has been
  // latched yet and no ritual has finished/started executing. Once latched,
  // this memo is ignored (see the effect below) so post-defer refreshes never
  // recompute absence.
  const candidate = useMemo(() => {
    if (!enabled) return null;
    const lastActivityAt = latestActivityTimestamp(state);
    const absence = detectAbsence({ lastActivityAt, now });
    if (!absence.absent) return null;

    const suppression = readSuppression();
    if (
      suppression &&
      absence.lastActivityAt !== null &&
      suppression.completedForLastActivityAt === absence.lastActivityAt
    ) {
      return null;
    }

    const summary = buildWhileYouWereOutSummary({ state, absence, now });
    const plan = planReEntryDeferrals({
      lapsedBlocks: summary.lapsedBlocks,
      allBlocks: state.calendarBlocks,
    });

    return { absence, summary, plan } satisfies LatchedRitual;
  }, [enabled, state, now]);

  useEffect(() => {
    if (latched || executedRef.current) {
      return;
    }
    if (!candidate) {
      return;
    }

    const ritualToRun = candidate;
    setLatched(ritualToRun);
    executedRef.current = true;

    let cancelled = false;

    async function run() {
      const client = createSupabaseBrowserClient();

      if (!client) {
        if (!cancelled) {
          setDemoMode(true);
          setStatus("ready");
        }
        return;
      }

      setStatus("deferring");
      const result = await executeReEntryDeferrals({
        client,
        plan: ritualToRun.plan,
        absenceDays: ritualToRun.absence.absenceDays,
        now,
      });

      if (cancelled) return;

      setOutcomes(result);

      if (refreshPersistedWorkflow) {
        await refreshPersistedWorkflow();
      }

      if (cancelled) return;
      setStatus("ready");
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, latched]);

  const complete = useCallback(() => {
    if (latched) {
      writeSuppression({
        completedForLastActivityAt: latched.absence.lastActivityAt ?? "",
      });
    }
    setStatus("done");
  }, [latched]);

  return {
    status,
    summary: latched?.summary ?? null,
    plan: latched?.plan ?? null,
    outcomes,
    demoMode,
    complete,
  };
}
