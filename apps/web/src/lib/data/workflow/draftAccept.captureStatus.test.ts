import { describe, expect, it, vi } from "vitest";
import {
  findJournaledTaskIdByClientWriteId,
  syncJournaledTaskDraftAccept,
} from "./draftAccept";
import {
  draftAcceptClient,
  draftAcceptInput as input,
  draftAcceptTask,
} from "@/testing/draftAcceptRpc";

vi.mock("./planning", () => ({ recordTaskAcceptance: vi.fn() }));
vi.mock("./people", () => ({ recordPersonLinkAcceptance: vi.fn() }));

// Wiring tier: task and capture travel through one transaction, never two
// client writes. PostgreSQL rollback/isolation belong to the local RLS suite.
describe("journalled triage accept — capture status truth", () => {
  it.each(["active", "backlog"] as const)(
    "resolves the source capture in the same transaction as a %s task",
    async (status) => {
      const { db, rpc, from } = draftAcceptClient();
      await syncJournaledTaskDraftAccept(db, { ...input, task_status: status });
      expect(rpc).toHaveBeenCalledOnce();
      expect(rpc).toHaveBeenCalledWith(
        "accept_task_draft",
        expect.objectContaining({
          p_task: expect.objectContaining({
            source_capture_item_id: input.source_capture_item_id,
            status,
          }),
        }),
      );
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("cannot report delivery when the capture write rejects the transaction", async () => {
    const { db, rpc, from } = draftAcceptClient();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "capture update denied", code: "42501" },
    });
    await expect(syncJournaledTaskDraftAccept(db, input)).rejects.toThrow(
      "capture update denied",
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("allows a capture that has not reached the account yet", async () => {
    const { db, rpc } = draftAcceptClient();
    await syncJournaledTaskDraftAccept(db, {
      ...input,
      source_capture_item_id: null,
    });
    expect(rpc.mock.calls[0][1].p_task.source_capture_item_id).toBeNull();
  });
  it("keeps signed-out acceptance queued without claiming delivery", async () => {
    expect(await syncJournaledTaskDraftAccept(null, input)).toEqual({
      provider: "mock",
      task: null,
      proposal: null,
      deduplicated: false,
    });
  });
  it("fails before any write when the atomic server capability is missing", async () => {
    const { db, from } = draftAcceptClient();
    delete db.rpc;
    await expect(syncJournaledTaskDraftAccept(db, input)).rejects.toMatchObject(
      { failureKind: "server-capability-missing" },
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("recovers the accepted task through the owner's original client write id", async () => {
    const { db, from } = draftAcceptClient();
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: draftAcceptTask, error: null });
    const keyEq = vi.fn(() => ({ maybeSingle }));
    const userEq = vi.fn(() => ({ eq: keyEq }));
    from.mockReturnValue({ select: vi.fn(() => ({ eq: userEq })) });
    expect(
      await findJournaledTaskIdByClientWriteId(db, " journal-accept-1 "),
    ).toBe(draftAcceptTask.id);
    expect(userEq).toHaveBeenCalledWith("user_id", draftAcceptTask.user_id);
    expect(keyEq).toHaveBeenCalledWith("client_write_id", "journal-accept-1");
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await findJournaledTaskIdByClientWriteId(db, "missing")).toBeNull();
  });
});
