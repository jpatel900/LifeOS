import { vi } from "vitest";
import type { SyncJournaledTaskDraftAcceptInput } from "@/lib/data/workflow/draftAccept";
import type { MinimalSupabaseClient } from "@/lib/data/workflow/shared";

// Response fixtures only. This does not simulate PostgreSQL transactions/RLS.
export const draftAcceptInput: SyncJournaledTaskDraftAcceptInput = {
  client_write_id: "test-draft-accept",
  area_id: "44444444-4444-4444-8444-444444444444",
  source_capture_item_id: "55555555-5555-4555-8555-555555555555",
  draft_id: "draft-1",
  title: "Synthetic accepted task",
  description: null,
  confidence: 0.8,
  task_type: "task",
  is_reversible: null,
  due_at: null,
  estimated_minutes_low: 10,
  estimated_minutes_high: 20,
  first_tiny_step: null,
  is_commitment: false,
  person_mentions: [],
  task_status: "active",
  accepted_at: "2026-10-23T00:00:00.000Z",
  proposal: null,
};
export const draftAcceptTask = {
  id: "66666666-6666-4666-8666-666666666666",
  user_id: "11111111-1111-4111-8111-111111111111",
  area_id: draftAcceptInput.area_id,
  source_capture_item_id: draftAcceptInput.source_capture_item_id,
  project_id: null,
  title: draftAcceptInput.title,
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: 0.8,
  task_type: "task",
  energy_type: null,
  estimated_minutes_low: 10,
  estimated_minutes_high: 20,
  due_at: null,
  definition_of_done: "Complete the first useful move and note the outcome.",
  first_tiny_step: null,
  created_at: draftAcceptInput.accepted_at,
  updated_at: draftAcceptInput.accepted_at,
};
export function draftAcceptClient() {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      task: draftAcceptTask,
      proposal: null,
      deduplicated: false,
      accepted_links: [],
    },
    error: null,
  });
  const from = vi.fn();
  const db: MinimalSupabaseClient = {
    rpc,
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: draftAcceptTask.user_id } },
        error: null,
      }),
    },
  };
  return { db, rpc, from };
}
