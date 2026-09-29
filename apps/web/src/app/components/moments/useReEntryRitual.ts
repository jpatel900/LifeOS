"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowState } from "@/lib/workflow";
import { detectAbsence, latestActivityTimestamp } from "@/lib/reEntry/detect";
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
import { createBriefViewRecorder } from "@/lib/reEntry/briefView";
import {
  clearReturnCheckpoint,
  readLastOpen,
  readReEntryThreshold,
  readReturnCheckpoint,
  recordLastOpen,
  recordLocalReturnResolution,
  reEntryScope,
  writeReturnCheckpoint,
  type ReturnCheckpoint,
} from "@/lib/reEntry/preferences";
import {
  recordRecoveryEdit,
  recordRecoveryResolution,
  recordReturnOpened,
  type RecoveryResolution,
} from "@/lib/reEntry/returnRecord";
import { uuidPattern } from "@/lib/data/workflow/metaLearning";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
  pending: boolean;
  checkpoint: ReturnCheckpoint | null;
  complete(resolution?: Omit<RecoveryResolution, "resolvedAt">): void;
  editRecovery(taskId: string, before: string, after: string): void;
  selectRecovery(taskId: string): void;
}
export function useReEntryRitual(
  input: UseReEntryRitualInput,
): UseReEntryRitualResult {
  const { state, now, enabled = true, refreshPersistedWorkflow } = input;
  const client = createSupabaseBrowserClient();
  const [identity, setIdentity] = useState({
    userId: null as string | null,
    ready: !client,
    generation: 0,
  });
  const authUserRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  // AuthAffordance keeps identity private to its component; no shared identity
  // hook exists. Use the same native client boundary, never task ownership as
  // account identity. Subscription is cleaned up and never refreshes workflow.
  useEffect(() => {
    if (!client) return;
    let active = true;
    let authChanged = false;
    const publishIdentity = (userId: string | null) => {
      if (!active) return;
      if (authUserRef.current !== userId) generationRef.current += 1;
      authUserRef.current = userId;
      setIdentity({ userId, ready: true, generation: generationRef.current });
    };
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      publishIdentity(session?.user.id ?? null);
    });
    void client.auth
      .getUser()
      .then(({ data: userData }) => {
        if (active && !authChanged) publishIdentity(userData.user?.id ?? null);
      })
      .catch(() => {
        if (active && !authChanged) publishIdentity(null);
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const scope = client ? identity.userId : reEntryScope(state);
  const entities = [
    ...state.areas,
    ...state.projects,
    ...state.tasks,
    ...state.captureItems,
    ...state.taskDrafts,
    ...state.timeBlockProposals,
    ...state.calendarBlocks,
    ...state.executionSessions,
  ];
  const owners = entities
    .map((item) => item.user_id)
    .filter((id) => uuidPattern.test(id));
  // A settled provider can still hold the previous account's rows during a
  // switch. Require positive, unmixed ownership; never fetch a second workflow.
  const sameAccountRows =
    !client || (owners.length > 0 && owners.every((id) => id === scope));
  const available =
    enabled && identity.ready && scope !== null && sameAccountRows;
  const availableRef = useRef(available);
  availableRef.current = available;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [status, setStatus] = useState<ReEntryRitualStatus>("idle");
  const [latched, setLatched] = useState<ReturnCheckpoint | null>(null);
  const latchedRef = useRef<ReturnCheckpoint | null>(null);
  const executedScope = useRef<string | null>(null);
  const openedScope = useRef<string | null>(null);
  const visit = `${scope}:${identity.generation}`;
  const latchedGeneration = useRef(-1);
  const recorder = useRef(createBriefViewRecorder());
  const current =
    available &&
    latched?.scope === scope &&
    latchedGeneration.current === identity.generation
      ? latched
      : null;

  const candidate = useMemo(() => {
    if (
      !available ||
      scope === null ||
      executedScope.current === visit ||
      openedScope.current === visit
    )
      return null;
    const stored = readReturnCheckpoint(scope);
    if (stored) return stored;
    const activity = latestActivityTimestamp(state);
    // Open/return events count on this device. Newer account activity also
    // counts, but this cannot measure app opens on another device.
    const open = readLastOpen(scope);
    const lastActivityAt =
      open && (!activity || Date.parse(open) > Date.parse(activity))
        ? open
        : activity;
    const absence = detectAbsence({
      lastActivityAt,
      now,
      thresholdDays: readReEntryThreshold(),
    });
    if (!absence.absent) return null;
    const summary = buildWhileYouWereOutSummary({ state, absence, now });
    return {
      version: 1,
      scope,
      instanceId: `${scope}:${absence.lastActivityAt}:${now.toISOString()}`,
      openedAt: now.toISOString(),
      absence,
      summary,
      plan: planReEntryDeferrals({
        lapsedBlocks: summary.lapsedBlocks,
        allBlocks: state.calendarBlocks,
      }),
      attempted: false,
      demoMode: !client,
      outcomes: [],
      selectedTaskId: null,
      edits: {},
    } satisfies ReturnCheckpoint;
  }, [available, scope, state, now, client, visit]);

  const save = useCallback((next: ReturnCheckpoint) => {
    if (scopeRef.current !== next.scope || !availableRef.current) return;
    latchedGeneration.current = generationRef.current;
    latchedRef.current = next;
    setLatched(next);
    writeReturnCheckpoint(next);
  }, []);
  useEffect(() => {
    if (!available || scope === null) return;
    if (executedScope.current === visit) return;
    if (!candidate) {
      if (openedScope.current !== visit) {
        openedScope.current = visit;
        recordLastOpen(scope, now);
      }
      return;
    }
    const startedGeneration = identity.generation;
    const stillCurrent = () =>
      scopeRef.current === scope &&
      generationRef.current === startedGeneration &&
      availableRef.current;
    executedScope.current = visit;
    openedScope.current = visit;
    // Save the original absence before opens or deferrals change the clock.
    save(candidate);
    recordLastOpen(scope, now);
    async function run() {
      if (candidate!.attempted) {
        setStatus("ready");
        return;
      }
      const attempted = { ...candidate!, attempted: true };
      save(attempted);
      recordReturnOpened(client, {
        instanceId: attempted.instanceId,
        absenceDays: attempted.absence.absenceDays,
        openedAt: attempted.openedAt,
        userId: client ? attempted.scope : undefined,
      });
      recorder.current.recordIfNeeded(client, now);
      if (!client) {
        setStatus("ready");
        return;
      }
      setStatus("deferring");
      const outcomes = await executeReEntryDeferrals({
        client,
        plan: attempted.plan,
        absenceDays: attempted.absence.absenceDays,
        now,
      });
      if (!stillCurrent()) return;
      save({ ...latchedRef.current!, outcomes });
      // A refresh failure cannot strand the ritual or fabricate a deferral.
      try {
        await refreshPersistedWorkflow?.();
      } catch {
        /* Existing account-save warnings retain ownership. */
      }
      if (stillCurrent()) setStatus("ready");
    }
    void run();
  }, [
    available,
    scope,
    candidate,
    client,
    now,
    refreshPersistedWorkflow,
    save,
    visit,
    identity.generation,
  ]);

  const complete = useCallback(
    (resolution?: Omit<RecoveryResolution, "resolvedAt">) => {
      const checkpoint = latchedRef.current;
      if (
        !checkpoint ||
        checkpoint.scope !== scopeRef.current ||
        !availableRef.current ||
        latchedGeneration.current !== generationRef.current
      )
        return;
      const result: RecoveryResolution = {
        decision: "dismissed",
        taskId: null,
        firstStep: null,
        edited: false,
        ...resolution,
        resolvedAt: now.toISOString(),
      };
      recordLocalReturnResolution(checkpoint, result);
      recordRecoveryResolution(
        client,
        {
          instanceId: checkpoint.instanceId,
          absenceDays: checkpoint.absence.absenceDays,
          openedAt: checkpoint.openedAt,
          userId: client ? checkpoint.scope : undefined,
        },
        result,
      );
      clearReturnCheckpoint(checkpoint.scope);
      latchedRef.current = null;
      recordLastOpen(checkpoint.scope, now);
      // Preserve the existing diagnostic field while making it user-scoped.
      try {
        window.localStorage.setItem(
          "lifeos.moments.reentry",
          JSON.stringify({
            scope: checkpoint.scope,
            completedForLastActivityAt: checkpoint.absence.lastActivityAt,
          }),
        );
      } catch {
        /* Blocked storage never blocks completion. */
      }
      setStatus("done");
    },
    [client, now],
  );
  const editRecovery = useCallback(
    (taskId: string, before: string, after: string) => {
      const checkpoint = latchedRef.current;
      if (
        !checkpoint ||
        checkpoint.scope !== scopeRef.current ||
        !availableRef.current ||
        latchedGeneration.current !== generationRef.current ||
        !after.trim()
      )
        return;
      const firstStep = after.trim();
      save({
        ...checkpoint,
        selectedTaskId: taskId,
        edits: { ...checkpoint.edits, [taskId]: firstStep },
      });
      recordRecoveryEdit(
        client,
        {
          instanceId: checkpoint.instanceId,
          absenceDays: checkpoint.absence.absenceDays,
          openedAt: checkpoint.openedAt,
          userId: client ? checkpoint.scope : undefined,
        },
        taskId,
        before,
        firstStep,
        state.tasks.find((task) => task.id === taskId)?.area_id ?? null,
      );
    },
    [client, save, state.tasks],
  );
  const selectRecovery = useCallback(
    (taskId: string) => {
      const checkpoint = latchedRef.current;
      if (
        checkpoint &&
        checkpoint.scope === scopeRef.current &&
        latchedGeneration.current === generationRef.current
      )
        save({ ...checkpoint, selectedTaskId: taskId });
    },
    [save],
  );
  return {
    status: current && available ? status : "idle",
    summary: current?.summary ?? null,
    plan: current?.plan ?? null,
    outcomes: current?.outcomes ?? [],
    demoMode: current?.demoMode ?? !client,
    pending: available && status === "idle" && candidate !== null,
    checkpoint: current,
    complete,
    editRecovery,
    selectRecovery,
  };
}
