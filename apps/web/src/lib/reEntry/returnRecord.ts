import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import {
  recordSuggestionFireAndForget,
  recordOverrideFireAndForget,
  RE_ENTRY_POLICY_ID,
  uuidPattern,
} from "@/lib/data/workflow/metaLearning";

const accountId = (id: string | null) =>
  id && uuidPattern.test(id) ? id : null;
export interface ReturnEvent {
  instanceId: string;
  absenceDays: number;
  openedAt: string;
  userId?: string;
}
export interface RecoveryResolution {
  decision: "accepted" | "dismissed";
  taskId: string | null;
  firstStep: string | null;
  edited: boolean;
  resolvedAt: string;
  areaId?: string | null;
}
export function recordReturnOpened(
  client: MinimalSupabaseClient | null,
  event: ReturnEvent,
): void {
  if (!client) return;
  recordSuggestionFireAndForget(
    client,
    {
      area_id: null,
      policy_identifier: RE_ENTRY_POLICY_ID,
      suggestion_type: "re_entry_return",
      subject_type: "return_ritual",
      subject_id: null,
      status: "accepted",
      decided_by: "system",
      resolved_at: event.openedAt,
      suggestion_json: {
        instance_id: event.instanceId,
        absence_days: event.absenceDays,
        opened_at: event.openedAt,
        scope: "device_return",
      },
    },
    event.userId,
  );
}
export function recordRecoveryResolution(
  client: MinimalSupabaseClient | null,
  event: ReturnEvent,
  resolution: RecoveryResolution,
): void {
  if (!client) return;
  recordSuggestionFireAndForget(
    client,
    {
      area_id: accountId(resolution.areaId ?? null),
      policy_identifier: RE_ENTRY_POLICY_ID,
      suggestion_type: "re_entry_recovery",
      subject_type: resolution.taskId ? "task" : "return_ritual",
      subject_id: accountId(resolution.taskId),
      status: resolution.decision === "accepted" ? "accepted" : "ignored",
      decided_by: "user",
      resolved_at: resolution.resolvedAt,
      suggestion_json: {
        instance_id: event.instanceId,
        absence_days: event.absenceDays,
        resolution: resolution.decision,
        task_id: resolution.taskId,
        first_step: resolution.firstStep,
        edited: resolution.edited,
        scope: "device_activation",
        account_save_confirmed: false,
      },
    },
    event.userId,
  );
}
export function recordRecoveryEdit(
  client: MinimalSupabaseClient | null,
  event: ReturnEvent,
  taskId: string,
  before: string,
  after: string,
  areaId: string | null,
): void {
  const subjectId = accountId(taskId);
  if (!client || !subjectId) return;
  recordOverrideFireAndForget(
    client,
    {
      area_id: accountId(areaId),
      policy_identifier: RE_ENTRY_POLICY_ID,
      subject_type: "task",
      subject_id: subjectId,
      override_type: "edited",
      old_value_json: { instance_id: event.instanceId, first_step: before },
      new_value_json: {
        instance_id: event.instanceId,
        first_step: after,
        scope: "device_proposal",
      },
    },
    event.userId,
  );
}
