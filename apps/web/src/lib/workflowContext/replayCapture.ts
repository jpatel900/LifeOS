import {
  listAreas,
  syncJournaledCapture,
  type MinimalSupabaseClient,
} from "../data/workflow";
import { requireSupabaseUser } from "../data/workflow/shared";
import { guardDeviceAccount } from "../durability/deviceAccount";
import type {
  CaptureWritePayload,
  SyncCaptureResult,
} from "../durability/durableWrites";
import { persistedAreaIdForWorkflowAreaId } from "../workflowAreaMapping";

/** Resolve against this account now, never a previous session's area map. */
export async function replayCapture(
  client: MinimalSupabaseClient,
  payload: CaptureWritePayload,
  clientCaptureId: string,
): Promise<SyncCaptureResult> {
  const account = guardDeviceAccount();
  const expectedUserId = account.account;
  if (typeof expectedUserId !== "string") {
    throw new Error("Sign in before syncing captures.");
  }

  let areaId: string | null = null;
  if (payload.workflow_area_id !== null || payload.persisted_area_id !== null) {
    const user = await requireSupabaseUser(
      client,
      "Sign in before syncing captures.",
    );
    account.assertCurrent();
    if (user.id !== expectedUserId) {
      throw new Error("Your account changed. Try again.");
    }
    const result = await listAreas(client);
    account.assertCurrent();
    if (
      result.provider !== "supabase" ||
      result.areas.some((area) => area.user_id !== expectedUserId)
    ) {
      throw new Error("Cannot confirm this capture's area yet. Try again.");
    }

    // A missing pinned ID is a removed area, even if its slug was reused.
    // A still-active pinned ID survives a rename. Only an unpinned capture
    // uses the workflow mapping. An empty successful read is valid evidence.
    areaId =
      payload.persisted_area_id !== null
        ? result.areas.some((area) => area.id === payload.persisted_area_id)
          ? payload.persisted_area_id
          : null
        : payload.workflow_area_id === null
          ? null
          : persistedAreaIdForWorkflowAreaId(
              payload.workflow_area_id,
              result.areas,
            );
  }

  const result = await syncJournaledCapture(
    client,
    {
      client_capture_id: clientCaptureId,
      area_id: areaId,
      raw_text: payload.raw_text,
      return_hook: payload.return_hook,
    },
    {
      expectedUserId,
      assertCurrentAccount: account.assertCurrent,
    },
  );
  account.assertCurrent();
  return result;
}
