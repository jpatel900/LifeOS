import { describe, expect, it, vi } from "vitest";
import type { MinimalSupabaseClient } from "@/lib/data/workflow";
import {
  recordReturnOpened,
  recordRecoveryResolution,
  recordRecoveryEdit,
} from "./returnRecord";

const USER = "00000000-0000-4000-8000-000000000001";
const TASK = "00000000-0000-4000-8000-000000000002";
const AREA = "00000000-0000-4000-8000-000000000003";
const event = {
  instanceId: "synthetic-return",
  absenceDays: 4,
  openedAt: "2026-09-29T12:00:00.000Z",
  userId: USER,
};
function fixture(fail = false) {
  const insert = vi.fn(() => ({
    select: () => ({
      single: async () => ({
        data: {},
        error: fail ? { message: "synthetic denial" } : null,
      }),
    }),
  }));
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER } }, error: null }),
    },
    from: vi.fn(() => ({ insert })),
  } as unknown as MinimalSupabaseClient;
  return { client, insert };
}
describe("return event records", () => {
  it("does not insert one user's return metadata after delayed auth resolves as another user", async () => {
    const { client, insert } = fixture();
    let finish!: (result: unknown) => void;
    client.auth!.getUser = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ) as typeof client.auth.getUser;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      recordReturnOpened(client, event);
      finish({ data: { user: { id: AREA } }, error: null });
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
      expect(insert).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
  it("records absence separately from deterministic deferrals", async () => {
    const { client, insert } = fixture();
    recordReturnOpened(client, event);
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(insert.mock.calls[0][0]).toMatchObject({
      user_id: USER,
      policy_identifier: "re_entry.v1",
      suggestion_type: "re_entry_return",
      subject_type: "return_ritual",
      area_id: null,
      suggestion_json: {
        instance_id: event.instanceId,
        absence_days: 4,
        scope: "device_return",
      },
    });
  });
  it("acceptance records actual step and area without claiming an account save", async () => {
    const { client, insert } = fixture();
    recordRecoveryResolution(client, event, {
      decision: "accepted",
      taskId: TASK,
      areaId: AREA,
      firstStep: "Open the draft",
      edited: true,
      resolvedAt: event.openedAt,
    });
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(insert.mock.calls[0][0]).toMatchObject({
      suggestion_type: "re_entry_recovery",
      subject_id: TASK,
      area_id: AREA,
      status: "accepted",
      decided_by: "user",
      suggestion_json: {
        edited: true,
        first_step: "Open the draft",
        scope: "device_activation",
        account_save_confirmed: false,
      },
    });
  });
  it("dismissal without a candidate is an ignored global proposal", async () => {
    const { client, insert } = fixture();
    recordRecoveryResolution(client, event, {
      decision: "dismissed",
      taskId: null,
      firstStep: null,
      edited: false,
      resolvedAt: event.openedAt,
    });
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(insert.mock.calls[0][0]).toMatchObject({
      status: "ignored",
      subject_id: null,
      area_id: null,
      suggestion_json: { resolution: "dismissed" },
    });
  });
  it("edits use existing override vocabulary and preserve task area", async () => {
    const { client, insert } = fixture();
    recordRecoveryEdit(client, event, TASK, "Open", "Write one line", AREA);
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(insert.mock.calls[0][0]).toMatchObject({
      override_type: "edited",
      subject_id: TASK,
      area_id: AREA,
      old_value_json: { first_step: "Open" },
      new_value_json: {
        first_step: "Write one line",
        scope: "device_proposal",
      },
    });
  });
  it("local ids never become invalid account UUIDs", async () => {
    const { client, insert } = fixture();
    recordRecoveryResolution(client, event, {
      decision: "accepted",
      taskId: "local-task",
      areaId: "local-area",
      firstStep: "Open",
      edited: false,
      resolvedAt: event.openedAt,
    });
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    expect(insert.mock.calls[0][0]).toMatchObject({
      subject_id: null,
      area_id: null,
    });
    recordRecoveryEdit(
      client,
      event,
      "local-task",
      "Open",
      "Write",
      "local-area",
    );
    expect(insert).toHaveBeenCalledOnce();
  });
  it("learning failure stays observable and cannot block the user action", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fixture(true);
    try {
      expect(recordReturnOpened(client, event)).toBeUndefined();
      await vi.waitFor(() =>
        expect(warn).toHaveBeenCalledWith(
          "LifeOS meta-learning write failed; user action preserved.",
          expect.objectContaining({ policy_identifier: "re_entry.v1" }),
        ),
      );
    } finally {
      warn.mockRestore();
    }
  });
});
