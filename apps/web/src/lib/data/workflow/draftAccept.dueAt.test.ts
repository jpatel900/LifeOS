import { describe, expect, it, vi } from "vitest";
import { syncJournaledTaskDraftAccept } from "./draftAccept";
import { draftAcceptClient, draftAcceptInput } from "@/testing/draftAcceptRpc";
vi.mock("./planning", () => ({ recordTaskAcceptance: vi.fn() }));
vi.mock("./people", () => ({ recordPersonLinkAcceptance: vi.fn() }));
const dueAt = "2026-09-30T16:00:00.000Z";
// FR-049: ordinary drafts never transfer due_at; decisions retain their deadline.
describe("journalled triage accept — due_at mapping", () => {
  it.each([null, "task"])(
    "drops due_at for ordinary task_type %s",
    async (taskType) => {
      const { db, rpc } = draftAcceptClient();
      await syncJournaledTaskDraftAccept(db, {
        ...draftAcceptInput,
        task_type: taskType,
        due_at: dueAt,
      });
      expect(rpc.mock.calls[0][1].p_task.due_at).toBeNull();
    },
  );
  it("drops due_at for backlogged ordinary drafts", async () => {
    const { db, rpc } = draftAcceptClient();
    await syncJournaledTaskDraftAccept(db, {
      ...draftAcceptInput,
      task_status: "backlog",
      due_at: dueAt,
    });
    expect(rpc.mock.calls[0][1].p_task.due_at).toBeNull();
  });
  it("preserves a decision's deadline and reversibility", async () => {
    const { db, rpc } = draftAcceptClient();
    await syncJournaledTaskDraftAccept(db, {
      ...draftAcceptInput,
      task_type: "decision",
      is_reversible: false,
      due_at: dueAt,
    });
    expect(rpc.mock.calls[0][1].p_task).toMatchObject({
      due_at: dueAt,
      is_reversible: false,
    });
  });
});
