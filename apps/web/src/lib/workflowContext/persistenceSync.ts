// WorkflowContext domain module — persistence sync.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only — no logic/behavior changes). This is the local↔persisted id
// bridge: every `persistX` action here takes the just-applied local write,
// pushes it to Supabase, records the persisted id against the local id in
// the matching ref map, and re-syncs the persisted rows. None of these are
// hooks (they were plain `function`/`async function` declarations in the
// provider body), so they are wrapped in a single factory that WorkflowContext
// calls once per render, exactly reproducing the original per-render closure
// semantics without touching hook order.
import type { MutableRefObject } from "react";
import type {
  Area,
  Phase2TaskDraft,
  Phase2TimeBlockProposal,
} from "@lifeos/schemas";
import {
  acceptTimeBlockProposal,
  applyTaskReviewTransition,
  createCaptureItem,
  createExecutionSession,
  createReviewEntry,
  createTask,
  createTimeBlockProposal,
  editTimeBlockProposal,
  findOrCreatePerson,
  markExecutionSession,
  recordPersonLinkAcceptance,
  rejectTimeBlockProposal,
  supersedePendingTimeBlockProposalsForTask,
  unplanCalendarBlock,
  type MinimalSupabaseClient,
  type ReviewTaskTargetStatus,
} from "../data/workflow";
import { normalizePersonName } from "../data/personLinks";
import { createSupabaseBrowserClient } from "../supabase/browser";
import type {
  Phase2MockCalendarBlock,
  Phase2MockExecutionSession,
  Phase2MockTask,
} from "../types";
import type { WorkflowState } from "../workflow";
import {
  persistedAreaIdForWorkflowId,
  persistedIdForLocalId,
} from "./reducerCore";

export interface PersistenceSyncDeps {
  persistedAreasRef: MutableRefObject<Area[]>;
  persistedCaptureIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedTaskIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedProposalIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedBlockIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedSessionIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  selectedAreaId: string | null;
  markLocalOnly: (message: string) => void;
  syncPersistedWorkflowRows: (
    client: MinimalSupabaseClient | null,
  ) => Promise<void>;
}

export function createPersistenceSync(deps: PersistenceSyncDeps) {
  const {
    persistedAreasRef,
    persistedCaptureIdByLocalIdRef,
    persistedTaskIdByLocalIdRef,
    persistedProposalIdByLocalIdRef,
    persistedBlockIdByLocalIdRef,
    persistedSessionIdByLocalIdRef,
    selectedAreaId,
    markLocalOnly,
    syncPersistedWorkflowRows,
  } = deps;

  async function persistCapture(
    localCapture: WorkflowState["captureItems"][number],
  ) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = localCapture.area_id
      ? persistedAreaIdForWorkflowId(
          localCapture.area_id,
          persistedAreasRef.current,
        )
      : null;

    if (!client || (localCapture.area_id && !persistedAreaId)) {
      markLocalOnly("Capture saved locally; account sync is not available.");
      return;
    }

    const result = await createCaptureItem(client, {
      raw_text: localCapture.raw_text,
      return_hook: localCapture.return_hook ?? null,
      area_id: persistedAreaId,
    });
    if (result.provider !== "supabase") {
      return;
    }

    persistedCaptureIdByLocalIdRef.current.set(
      localCapture.id,
      result.capture.id,
    );
    await syncPersistedWorkflowRows(client);
  }

  async function persistAcceptedTaskDraft(
    draft: Phase2TaskDraft,
    localTask: Phase2MockTask,
    localProposal: Phase2TimeBlockProposal | null,
    status: "active" | "backlog",
  ) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = persistedAreaIdForWorkflowId(
      draft.area_id,
      persistedAreasRef.current,
    );

    if (!client || !persistedAreaId) {
      markLocalOnly("Triage decision saved locally; account sync is pending.");
      return;
    }

    const sourceCaptureId = persistedIdForLocalId(
      draft.capture_item_id,
      persistedCaptureIdByLocalIdRef.current,
    );

    // S3 (#255): resolve the approved person links before the task insert (FK
    // ordering). A mention that survived to accept was not rejected, so it is
    // user-approved. For each such mention we find-or-create the person
    // (idempotent per normalized_name, re-checked at accept time), then write the
    // link column for its role. Multiple mentions of one role map to a single
    // column, so the first resolved id wins deterministically. role "mention" is
    // informational — it creates the person but links no column. A find/create
    // failure degrades that one link to no-link; the task still lands (NS-INV-4).
    const acceptTime = new Date().toISOString();
    let waitingOnPersonId: string | null = null;
    let committedToPersonId: string | null = null;
    const acceptedLinks: Array<{
      name: string;
      role: "waiting_on" | "committed_to" | "mention";
      personId: string | null;
    }> = [];

    for (const mention of draft.person_mentions) {
      // role "mention" is informational only (deliverable b): it links no column
      // and creates no person row — approval to create a person (FR-017) comes
      // only with a waiting_on / committed_to link. Its pending suggestion is
      // still resolved to accepted below.
      let personId: string | null = null;
      if (mention.role === "waiting_on" || mention.role === "committed_to") {
        try {
          const personResult = await findOrCreatePerson(client, {
            display_name: mention.name,
            normalized_name: normalizePersonName(mention.name),
          });
          personId = personResult.person?.id ?? null;
        } catch {
          // A person find/create failure degrades this link to no-link; never
          // block the task creation the user just approved.
          personId = null;
        }
      }

      if (personId) {
        if (mention.role === "waiting_on" && !waitingOnPersonId) {
          waitingOnPersonId = personId;
        } else if (mention.role === "committed_to" && !committedToPersonId) {
          committedToPersonId = personId;
        }
      }

      acceptedLinks.push({ name: mention.name, role: mention.role, personId });
    }

    // committed_to link OR an approved commitment draft flag both set the task as
    // a commitment (deliverable b honors draft.is_commitment without a person).
    const isCommitment = draft.is_commitment || committedToPersonId !== null;

    const taskResult = await createTask(client, {
      area_id: persistedAreaId,
      source_capture_item_id: sourceCaptureId,
      title: draft.title,
      description: draft.description,
      status,
      priority_confidence: draft.confidence,
      task_type: draft.task_type ?? "task",
      is_reversible:
        draft.task_type === "decision" ? (draft.is_reversible ?? null) : null,
      due_at: draft.due_at ?? null,
      estimated_minutes_low: draft.estimated_minutes_low,
      estimated_minutes_high: draft.estimated_minutes_high,
      first_tiny_step: draft.first_tiny_step,
      waiting_on_person_id: waitingOnPersonId,
      waiting_on_since: waitingOnPersonId ? acceptTime : null,
      is_commitment: isCommitment,
      committed_to_person_id: committedToPersonId,
    });

    if (taskResult.provider !== "supabase") {
      return;
    }

    // Resolve the pending person-link proposals to accepted (mirrors the
    // rejection path). Fire-and-forget — a learning-write failure never affects
    // the accept flow (NS-INV-3).
    for (const link of acceptedLinks) {
      recordPersonLinkAcceptance(client, {
        area_id: persistedAreaId,
        draft_id: draft.id,
        name: link.name,
        role: link.role,
        matched_person_id: link.personId,
      });
    }

    persistedTaskIdByLocalIdRef.current.set(localTask.id, taskResult.task.id);

    if (localProposal && status === "active") {
      const proposalResult = await createTimeBlockProposal(client, {
        task_id: taskResult.task.id,
        proposed_start: localProposal.proposed_start,
        proposed_end: localProposal.proposed_end,
        rationale_note: localProposal.rationale,
      });
      if (proposalResult.provider === "supabase") {
        persistedProposalIdByLocalIdRef.current.set(
          localProposal.id,
          proposalResult.proposal.id,
        );
      }
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistPlannedTask(
    localTaskId: string,
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly("Plan saved locally; account sync is pending.");
      return;
    }

    const proposalResult = await createTimeBlockProposal(client, {
      task_id: persistedTaskId,
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
      rationale_note: localProposal.rationale,
    });
    if (proposalResult.provider !== "supabase") {
      return;
    }

    persistedProposalIdByLocalIdRef.current.set(
      localProposal.id,
      proposalResult.proposal.id,
    );

    const acceptResult = await acceptTimeBlockProposal(
      client,
      proposalResult.proposal.id,
    );
    if (acceptResult.provider === "supabase") {
      persistedBlockIdByLocalIdRef.current.set(
        localBlock.id,
        acceptResult.block.id,
      );
    }

    // #580: mirror the local supersede-on-place transition so a later sync
    // cannot resurrect a pending proposal for the task just placed. Runs
    // after the accept RPC, so the accepted proposal is already settled.
    await supersedePendingTimeBlockProposalsForTask(client, persistedTaskId);

    await syncPersistedWorkflowRows(client);
  }

  async function persistCreatedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localProposal.task_id,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly("Proposal created locally; account sync is pending.");
      return;
    }

    const proposalResult = await createTimeBlockProposal(client, {
      task_id: persistedTaskId,
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
      rationale_note: localProposal.rationale,
    });
    if (proposalResult.provider !== "supabase") {
      return;
    }

    persistedProposalIdByLocalIdRef.current.set(
      localProposal.id,
      proposalResult.proposal.id,
    );

    await syncPersistedWorkflowRows(client);
  }

  async function persistEditedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client || !persistedProposalId) {
      markLocalOnly("Proposal edit saved locally; account sync is pending.");
      return;
    }

    await editTimeBlockProposal(client, persistedProposalId, {
      proposed_start: localProposal.proposed_start,
      proposed_end: localProposal.proposed_end,
    });

    await syncPersistedWorkflowRows(client);
  }

  async function persistRejectedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client || !persistedProposalId) {
      markLocalOnly("Proposal rejected locally; account sync is pending.");
      return;
    }

    await rejectTimeBlockProposal(client, persistedProposalId);
    await syncPersistedWorkflowRows(client);
  }

  async function persistAcceptedLocalProposal(
    localProposal: Phase2TimeBlockProposal,
    localBlock: Phase2MockCalendarBlock | null,
  ) {
    const client = createSupabaseBrowserClient();
    let persistedProposalId = persistedIdForLocalId(
      localProposal.id,
      persistedProposalIdByLocalIdRef.current,
    );

    if (!client) {
      markLocalOnly("Proposal accepted locally; account sync is pending.");
      return;
    }

    if (!persistedProposalId) {
      const persistedTaskId = persistedIdForLocalId(
        localProposal.task_id,
        persistedTaskIdByLocalIdRef.current,
      );

      if (!persistedTaskId) {
        markLocalOnly("Proposal accepted locally; account sync is pending.");
        return;
      }

      const proposalResult = await createTimeBlockProposal(client, {
        task_id: persistedTaskId,
        proposed_start: localProposal.proposed_start,
        proposed_end: localProposal.proposed_end,
        rationale_note: localProposal.rationale,
      });
      if (proposalResult.provider !== "supabase") {
        return;
      }
      persistedProposalId = proposalResult.proposal.id;
      persistedProposalIdByLocalIdRef.current.set(
        localProposal.id,
        proposalResult.proposal.id,
      );
    }

    const acceptResult = await acceptTimeBlockProposal(
      client,
      persistedProposalId,
    );
    if (acceptResult.provider === "supabase" && localBlock) {
      persistedBlockIdByLocalIdRef.current.set(
        localBlock.id,
        acceptResult.block.id,
      );
    }

    // #580: mirror the local supersede-on-place transition (accept = place)
    // so sibling pending proposal rows for the task cannot come back as
    // active on the next sync. Runs after the accept RPC settles this one.
    const persistedTaskIdForSupersede = persistedIdForLocalId(
      localProposal.task_id,
      persistedTaskIdByLocalIdRef.current,
    );
    if (persistedTaskIdForSupersede) {
      await supersedePendingTimeBlockProposalsForTask(
        client,
        persistedTaskIdForSupersede,
      );
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistUnplannedBlock(localBlockId: string) {
    const client = createSupabaseBrowserClient();
    const persistedBlockId = persistedIdForLocalId(
      localBlockId,
      persistedBlockIdByLocalIdRef.current,
    );

    if (!client || !persistedBlockId) {
      markLocalOnly("Unplanned locally; account sync is pending.");
      return;
    }

    await unplanCalendarBlock(client, persistedBlockId);
    await syncPersistedWorkflowRows(client);
  }

  async function persistTaskReviewTransition(
    localTaskId: string,
    targetStatus: ReviewTaskTargetStatus,
  ) {
    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localTaskId,
      persistedTaskIdByLocalIdRef.current,
    );

    if (!client || !persistedTaskId) {
      markLocalOnly("Recovery choice saved locally; account sync is pending.");
      return;
    }

    await applyTaskReviewTransition(client, persistedTaskId, targetStatus);
    await syncPersistedWorkflowRows(client);
  }

  async function persistReviewEntry(next: WorkflowState) {
    const client = createSupabaseBrowserClient();
    const persistedAreaId = selectedAreaId
      ? persistedAreaIdForWorkflowId(selectedAreaId, persistedAreasRef.current)
      : null;

    if (!client || (selectedAreaId && !persistedAreaId)) {
      markLocalOnly("Review saved locally; account sync is pending.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    await createReviewEntry(client, {
      review_type: "daily",
      period_start: today,
      period_end: today,
      area_id: persistedAreaId,
      summary_json: {
        verdict: "saved",
        completed_sessions: next.executionSessions.filter(
          (session) => session.status === "completed",
        ).length,
        missed_sessions: next.executionSessions.filter(
          (session) => session.status === "missed",
        ).length,
        distracted_sessions: next.executionSessions.filter(
          (session) => session.status === "distracted",
        ).length,
        open_tasks: next.tasks.filter((task) =>
          ["active", "backlog", "scheduled", "blocked"].includes(task.status),
        ).length,
        scheduled_blocks: next.calendarBlocks.filter((block) =>
          ["scheduled", "running"].includes(block.status),
        ).length,
        recent_log: next.reviewLog.slice(0, 8),
      },
    });

    await syncPersistedWorkflowRows(client);
  }

  async function persistStartedSession(
    localSession: Phase2MockExecutionSession,
  ) {
    if (!localSession.task_id) {
      return;
    }

    const client = createSupabaseBrowserClient();
    const persistedTaskId = persistedIdForLocalId(
      localSession.task_id,
      persistedTaskIdByLocalIdRef.current,
    );
    const persistedBlockId = localSession.calendar_block_id
      ? persistedIdForLocalId(
          localSession.calendar_block_id,
          persistedBlockIdByLocalIdRef.current,
        )
      : null;

    if (!client || !persistedTaskId) {
      markLocalOnly(
        "Execution session saved locally; account sync is pending.",
      );
      return;
    }

    const result = await createExecutionSession(client, {
      task_id: persistedTaskId,
      calendar_block_id: persistedBlockId,
    });
    if (result.provider !== "supabase") {
      return;
    }

    persistedSessionIdByLocalIdRef.current.set(
      localSession.id,
      result.session.id,
    );
    if (result.block && localSession.calendar_block_id) {
      persistedBlockIdByLocalIdRef.current.set(
        localSession.calendar_block_id,
        result.block.id,
      );
    }

    await syncPersistedWorkflowRows(client);
  }

  async function persistMarkedSession(
    localSession: Phase2MockExecutionSession,
    status: Phase2MockExecutionSession["status"],
    actualMinutes?: number,
    notes?: string | null,
    capOutcome?: Phase2MockExecutionSession["cap_outcome"],
  ) {
    const client = createSupabaseBrowserClient();
    const persistedSessionId = persistedIdForLocalId(
      localSession.id,
      persistedSessionIdByLocalIdRef.current,
    );

    if (!client || !persistedSessionId) {
      markLocalOnly("Session outcome saved locally; account sync is pending.");
      return;
    }

    await markExecutionSession(client, persistedSessionId, {
      // The persisted MarkExecutionSessionInput `status` enum
      // (@lifeos/schemas) is a red-zone constant that doesn't carry
      // "partial"/"skipped" — it has no DB column and is only used by
      // `executionMarkPatch` to special-case "paused". "partial" and
      // "skipped" map to any non-"paused" member so that branch is skipped
      // and their real semantics ride entirely on `outcome` below, which
      // already has both values (EXECUTION_SESSION_OUTCOMES).
      status:
        status === "completed"
          ? "completed"
          : status === "missed" || status === "skipped"
            ? "missed"
            : status === "distracted"
              ? "distracted"
              : status === "paused"
                ? "paused"
                : "stuck",
      outcome:
        status === "completed"
          ? "completed"
          : status === "missed"
            ? "skipped"
            : status === "distracted"
              ? "distracted"
              : status === "stuck"
                ? "blocked"
                : status === "partial"
                  ? "partial"
                  : status === "skipped"
                    ? "skipped"
                    : null,
      actual_minutes:
        status === "paused"
          ? null
          : (actualMinutes ?? localSession.actual_minutes ?? 0),
      productivity_rating:
        status === "paused" ? null : status === "completed" ? 4 : 1,
      cap_outcome: capOutcome ?? null,
      notes:
        notes !== undefined
          ? notes
          : status === "stuck"
            ? "Need a smaller next step."
            : null,
    });

    await syncPersistedWorkflowRows(client);
  }

  return {
    persistCapture,
    persistAcceptedTaskDraft,
    persistPlannedTask,
    persistCreatedLocalProposal,
    persistEditedLocalProposal,
    persistRejectedLocalProposal,
    persistAcceptedLocalProposal,
    persistUnplannedBlock,
    persistTaskReviewTransition,
    persistReviewEntry,
    persistStartedSession,
    persistMarkedSession,
  };
}

export type PersistenceSyncOps = ReturnType<typeof createPersistenceSync>;
