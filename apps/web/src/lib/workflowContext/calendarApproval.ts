// WorkflowContext domain module — Google Calendar approval bridge.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only — no logic/behavior changes). Binding invariant: no external
// calendar write happens without explicit UI approval — every call here is
// reached only from an explicit `approveProposalGoogleWrite` /
// `cancelGoogleCalendarBlock` context action, never a background effect.
import type { MutableRefObject } from "react";
import {
  applyGoogleCalendarCancelResult,
  applyGoogleCalendarWriteResult,
  type WorkflowState,
} from "../workflow";
import { createSupabaseBrowserClient } from "../supabase/browser";
import { isLifeOsOwnedGoogleEventIdShape } from "../cockpit/googleCalendarBridge";
import type { MinimalSupabaseClient } from "../data/workflow";
import { persistedIdForLocalId } from "./reducerCore";
import type { ApplyWorkflowState } from "./applyWorkflowState";
import type {
  GoogleCalendarBridgeResult,
  GoogleCalendarWriteRoutePayload,
} from "./types";

export interface CalendarApprovalDeps {
  stateRef: MutableRefObject<WorkflowState>;
  persistedProposalIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  persistedBlockIdByLocalIdRef: MutableRefObject<Map<string, string>>;
  applyWorkflowState: ApplyWorkflowState;
  syncPersistedWorkflowRows: (
    client: MinimalSupabaseClient | null,
  ) => Promise<void>;
  markPersistedLoadFailure: (error: unknown) => void;
}

export function createCalendarApproval(deps: CalendarApprovalDeps) {
  const {
    stateRef,
    persistedProposalIdByLocalIdRef,
    persistedBlockIdByLocalIdRef,
    applyWorkflowState,
    syncPersistedWorkflowRows,
    markPersistedLoadFailure,
  } = deps;

  async function getGoogleBridgeAccessToken(): Promise<
    | { ok: true; accessToken: string }
    | { ok: false; result: GoogleCalendarBridgeResult }
  > {
    const client = createSupabaseBrowserClient();

    if (
      !client ||
      !client.auth ||
      typeof client.auth.getSession !== "function"
    ) {
      return {
        ok: false,
        result: {
          outcome: "unavailable",
          message:
            "Google Calendar is unavailable in local-only mode. Local planning keeps working.",
        },
      };
    }

    const { data, error } = await client.auth.getSession();

    if (error || !data.session?.access_token) {
      return {
        ok: false,
        result: {
          outcome: "unavailable",
          message:
            "Sign in before approving Google Calendar changes. Local planning keeps working.",
        },
      };
    }

    return { ok: true, accessToken: data.session.access_token };
  }

  async function postGoogleCalendarRoute(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<
    | {
        ok: true;
        response: Response;
        payload: GoogleCalendarWriteRoutePayload | null;
      }
    | { ok: false; result: GoogleCalendarBridgeResult }
  > {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response
        .json()
        .catch(() => null)) as GoogleCalendarWriteRoutePayload | null;
      return { ok: true, response, payload };
    } catch {
      return {
        ok: false,
        result: {
          outcome: "failed",
          message:
            "The Google Calendar request could not be sent. Local plan data is unchanged.",
        },
      };
    }
  }

  async function approveProposalGoogleWrite(
    proposalId: string,
    options?: { acknowledgeFirstWriteWarning?: boolean },
  ): Promise<GoogleCalendarBridgeResult> {
    const proposal = stateRef.current.timeBlockProposals.find(
      (item) => item.id === proposalId,
    );
    if (!proposal) {
      return {
        outcome: "failed",
        message: "This proposal is no longer part of the local plan.",
      };
    }

    const session = await getGoogleBridgeAccessToken();
    if (!session.ok) {
      return session.result;
    }

    const persistedProposalId = persistedIdForLocalId(
      proposalId,
      persistedProposalIdByLocalIdRef.current,
    );
    if (!persistedProposalId) {
      return {
        outcome: "unavailable",
        message:
          "This proposal has not synced to your account yet, so it cannot be written to Google. Try again after sync.",
      };
    }

    const sent = await postGoogleCalendarRoute(
      "/api/google-calendar/create-event",
      session.accessToken,
      {
        proposal_id: persistedProposalId,
        approved: true,
        acknowledge_first_write_warning: Boolean(
          options?.acknowledgeFirstWriteWarning,
        ),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
    );
    if (!sent.ok) {
      return sent.result;
    }

    const { response, payload } = sent;

    if (response.status === 428 && payload?.first_write_warning_required) {
      return {
        outcome: "first-write-warning",
        message:
          payload.error ??
          "Acknowledge the first Google Calendar write warning before creating the first event.",
      };
    }

    if (
      !response.ok ||
      !payload?.ok ||
      typeof payload.google_event_id !== "string"
    ) {
      return {
        outcome: "failed",
        message:
          payload?.error ??
          "Google Calendar write failed. The local proposal is unchanged.",
      };
    }

    const previous = stateRef.current;
    const next = applyGoogleCalendarWriteResult(
      previous,
      proposalId,
      payload.google_event_id,
    );
    const localBlock =
      next.calendarBlocks.find(
        (block) =>
          !previous.calendarBlocks.some((item) => item.id === block.id),
      ) ?? null;
    applyWorkflowState(next);

    if (localBlock && typeof payload.block?.id === "string") {
      persistedBlockIdByLocalIdRef.current.set(localBlock.id, payload.block.id);
    }

    void syncPersistedWorkflowRows(createSupabaseBrowserClient()).catch(
      (error) => {
        markPersistedLoadFailure(error);
      },
    );

    return {
      outcome: "created",
      message: "Google Calendar event created from your approved proposal.",
    };
  }

  async function cancelGoogleCalendarBlock(
    blockId: string,
  ): Promise<GoogleCalendarBridgeResult> {
    const block = stateRef.current.calendarBlocks.find(
      (item) => item.id === blockId,
    );
    if (!block || !isLifeOsOwnedGoogleEventIdShape(block.google_event_id)) {
      return {
        outcome: "failed",
        message:
          "Only calendar events created by LifeOS can be cancelled from the cockpit.",
      };
    }

    const session = await getGoogleBridgeAccessToken();
    if (!session.ok) {
      return session.result;
    }

    const persistedBlockId = persistedIdForLocalId(
      blockId,
      persistedBlockIdByLocalIdRef.current,
    );
    if (!persistedBlockId) {
      return {
        outcome: "unavailable",
        message:
          "This block has not synced to your account yet, so its Google event cannot be cancelled from here.",
      };
    }

    const sent = await postGoogleCalendarRoute(
      "/api/google-calendar/cancel-event",
      session.accessToken,
      {
        calendar_block_id: persistedBlockId,
        approved: true,
      },
    );
    if (!sent.ok) {
      return sent.result;
    }

    const { response, payload } = sent;

    if (!response.ok || !payload?.ok) {
      return {
        outcome: "failed",
        message:
          payload?.error ??
          "Google Calendar cancel failed. Local block data is unchanged.",
      };
    }

    const next = applyGoogleCalendarCancelResult(stateRef.current, blockId);
    applyWorkflowState(next);

    void syncPersistedWorkflowRows(createSupabaseBrowserClient()).catch(
      (error) => {
        markPersistedLoadFailure(error);
      },
    );

    return {
      outcome: "cancelled",
      message: payload.event_already_gone
        ? "The Google event was already gone. The local block is now cancelled."
        : "Google Calendar event cancelled. The task is back in the plannable pool.",
    };
  }

  return {
    approveProposalGoogleWrite,
    cancelGoogleCalendarBlock,
  };
}

export type CalendarApprovalOps = ReturnType<typeof createCalendarApproval>;
