import { describe, expect, it, vi } from "vitest";
import {
  syncJournaledTaskDraftAccept,
  type SyncJournaledTaskDraftAcceptInput,
} from "./draftAccept";
import type { MinimalSupabaseClient } from "./shared";
import { getPersistenceFailureKind } from "../../persistenceFailureKind";

vi.mock("./metaLearning", () => ({ recordSuggestionFireAndForget: vi.fn() }));
vi.mock("./people", () => ({ recordPersonLinkAcceptance: vi.fn() }));

const input: SyncJournaledTaskDraftAcceptInput = {
  client_write_id: "atomic-accept-1",
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
  person_mentions: [{ name: "  Sample   Person ", role: "waiting_on" }],
  task_status: "active",
  accepted_at: "2026-10-23T00:00:00.000Z",
  proposal: null,
};
const task = {
  id: "66666666-6666-4666-8666-666666666666",
  user_id: "11111111-1111-4111-8111-111111111111",
  area_id: input.area_id,
  source_capture_item_id: input.source_capture_item_id,
  project_id: null,
  title: input.title,
  description: null,
  status: "active",
  priority_score: null,
  priority_confidence: 0.8,
  task_type: "task",
  energy_type: null,
  estimated_minutes_low: 10,
  estimated_minutes_high: 20,
  due_at: null,
  definition_of_done: null,
  first_tiny_step: null,
  created_at: input.accepted_at,
  updated_at: input.accepted_at,
};
function client(error: unknown = null, deduplicated = false) {
  const rpc = vi.fn().mockResolvedValue({
    data: error
      ? null
      : { task, proposal: null, deduplicated, accepted_links: [] },
    error,
  });
  const from = vi.fn(() => {
    throw new Error("Dependent writes must use the transaction RPC");
  });
  const db = {
    rpc,
    from,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: task.user_id } },
        error: null,
      }),
    },
  };
  return { db: db as MinimalSupabaseClient, rpc, from };
}
describe("draft acceptance transaction boundary", () => {
  it("commits through one RPC without client-side dependent writes", async () => {
    const { db, rpc, from } = client();
    const result = await syncJournaledTaskDraftAccept(db, input);
    expect(result.task?.id).toBe(task.id);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "accept_task_draft",
      expect.objectContaining({
        p_task: expect.objectContaining({
          client_write_id: input.client_write_id,
          source_capture_item_id: input.source_capture_item_id,
        }),
        p_person_mentions: [
          {
            name: "  Sample   Person ",
            normalized_name: "sample person",
            role: "waiting_on",
          },
        ],
        p_accepted_at: input.accepted_at,
        p_proposal: null,
      }),
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("propagates transaction rejection without a sequential fallback", async () => {
    const { db, rpc, from } = client({
      message: "capture update denied",
      code: "42501",
    });
    await expect(syncJournaledTaskDraftAccept(db, input)).rejects.toThrow(
      "capture update denied",
    );
    expect(rpc).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
  });
  it("keeps missing-function errors typed for the durable queue", async () => {
    const { db } = client({
      message:
        "Could not find the function public.accept_task_draft in the schema cache",
      code: "PGRST202",
    });
    const error = await syncJournaledTaskDraftAccept(db, input).catch(
      (failure: unknown) => failure,
    );
    expect(getPersistenceFailureKind(error)).toBe("server-capability-missing");
  });
  it("preserves server replay truth and stable task identity", async () => {
    const { db } = client(null, true);
    expect(await syncJournaledTaskDraftAccept(db, input)).toMatchObject({
      provider: "supabase",
      task: { id: task.id },
      deduplicated: true,
    });
  });
  it("accepts a numeric-offset accepted_at, as PostgREST and older journals write it", async () => {
    const { db, rpc } = client();
    const accepted_at = "2026-10-23T00:00:00+00:00";
    await syncJournaledTaskDraftAccept(db, { ...input, accepted_at });
    expect(rpc).toHaveBeenCalledWith(
      "accept_task_draft",
      expect.objectContaining({ p_accepted_at: accepted_at }),
    );
  });
  // Review round 2: a malformed optional proposal must not roll back (and
  // so block forever) the accept itself.
  it.each([
    {
      proposed_start: "2026-10-24T16:00:00.000Z",
      proposed_end: "2026-10-24T15:00:00.000Z",
      rationale: "End before start",
    },
    {
      proposed_start: "not a time",
      proposed_end: "2026-10-24T15:00:00.000Z",
      rationale: "Bad start",
    },
  ])(
    "drops an invalid optional proposal and still accepts the task",
    async (proposal) => {
      const { db, rpc } = client();
      await syncJournaledTaskDraftAccept(db, { ...input, proposal });
      expect(rpc).toHaveBeenCalledWith(
        "accept_task_draft",
        expect.objectContaining({ p_proposal: null }),
      );
    },
  );
  it("keeps a valid offset-form proposal", async () => {
    const { db, rpc } = client();
    const proposal = {
      proposed_start: "2026-10-24T16:00:00+00:00",
      proposed_end: "2026-10-24T16:30:00+00:00",
      rationale: "Fits the morning",
    };
    await syncJournaledTaskDraftAccept(db, { ...input, proposal });
    expect(rpc).toHaveBeenCalledWith(
      "accept_task_draft",
      expect.objectContaining({ p_proposal: proposal }),
    );
  });
  it("keeps the no-account accept queued", async () => {
    expect(await syncJournaledTaskDraftAccept(null, input)).toEqual({
      provider: "mock",
      task: null,
      proposal: null,
      deduplicated: false,
    });
  });
});
