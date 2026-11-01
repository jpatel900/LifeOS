import { describe, expect, it, vi } from "vitest";
import {
  PersistenceWriteError,
  getPersistenceFailureKind,
} from "../../persistenceFailureKind";
import { editTimeBlockProposal } from "./calendar";
import {
  syncJournaledExecutionSession,
  syncJournaledReviewEntry,
} from "./execution";
import { syncJournaledRollup, syncJournaledWin } from "./rollups";
import type { MinimalSupabaseClient } from "./shared";

const userId = "00000000-0000-4000-8000-000000000001";
const areaId = "00000000-0000-4000-8000-000000000101";
const taskId = "00000000-0000-4000-8000-000000000301";
const proposalId = "00000000-0000-4000-8000-000000000501";
const start = "2026-05-08T16:00:00.000Z";
const end = "2026-05-08T17:00:00.000Z";
const privateInput = "private-invalid-input";

const winInput = {
  client_write_id: "journal-win-input",
  area_id: areaId,
  source_task_id: taskId,
  title: "Finished a test task",
  occurred_at: "2026-05-08",
};
const reviewInput = {
  client_write_id: "journal-review-input",
  area_id: areaId,
  review_type: "daily" as const,
  period_start: "2026-05-08",
  period_end: "2026-05-08",
  summary_json: {},
};
const rollupInput = {
  client_write_id: "journal-rollup-input",
  area_id: areaId,
  period_type: "week" as const,
  period_start: "2026-05-04",
  period_end: "2026-05-10",
  summary: { highlights: [], misses: [], counts: {} },
};
const sessionInput = {
  client_write_id: "journal-session-input",
  task_id: taskId,
  calendar_block_id: null,
  outcome: "completed",
  actual_minutes: 10,
  paused_minutes: 0,
  distraction_minutes: 0,
  productivity_rating: null,
  notes: null,
  cap_outcome: null,
  defer_task: false,
};
const proposalInput = { proposed_start: start, proposed_end: end };

function accountClient(result: { data: unknown; error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result);
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ upsert, update });
  const rpc = vi.fn().mockResolvedValue(result);
  const getUser = vi.fn().mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  const client: MinimalSupabaseClient = {
    from,
    rpc,
    auth: { getUser },
  };
  return { client, from, rpc, getUser, upsert, single, update };
}

interface ReplayAdapterCase {
  name: string;
  invalid: (client: MinimalSupabaseClient) => Promise<unknown>;
  valid: (client: MinimalSupabaseClient) => Promise<unknown>;
  missingWriteId?: (client: MinimalSupabaseClient) => Promise<unknown>;
  readsBack?: boolean;
}

const replayAdapters: ReplayAdapterCase[] = [
  {
    name: "syncJournaledWin",
    invalid: (client) =>
      syncJournaledWin(client, {
        ...winInput,
        title: " ",
        detail: privateInput,
      }),
    valid: (client) => syncJournaledWin(client, winInput),
    missingWriteId: (client) =>
      syncJournaledWin(client, { ...winInput, client_write_id: "" }),
  },
  {
    name: "syncJournaledReviewEntry",
    invalid: (client) =>
      syncJournaledReviewEntry(client, {
        ...reviewInput,
        period_end: "2026-05-07",
        summary_json: { note: privateInput },
      }),
    valid: (client) => syncJournaledReviewEntry(client, reviewInput),
    missingWriteId: (client) =>
      syncJournaledReviewEntry(client, { ...reviewInput, client_write_id: "" }),
  },
  {
    name: "syncJournaledRollup",
    invalid: (client) =>
      syncJournaledRollup(client, {
        ...rollupInput,
        period_end: "2026-05-03",
      }),
    valid: (client) => syncJournaledRollup(client, rollupInput),
    missingWriteId: (client) =>
      syncJournaledRollup(client, { ...rollupInput, client_write_id: "" }),
  },
  {
    name: "syncJournaledExecutionSession",
    invalid: (client) =>
      syncJournaledExecutionSession(client, {
        ...sessionInput,
        outcome: privateInput,
      }),
    valid: (client) => syncJournaledExecutionSession(client, sessionInput),
    missingWriteId: (client) =>
      syncJournaledExecutionSession(client, {
        ...sessionInput,
        client_write_id: "",
      }),
  },
  {
    name: "editTimeBlockProposal",
    invalid: (client) =>
      editTimeBlockProposal(client, proposalId, {
        proposed_start: end,
        proposed_end: start,
      }),
    valid: (client) => editTimeBlockProposal(client, proposalId, proposalInput),
    readsBack: true,
  },
];

describe("replay adapter input failures", () => {
  it.each(replayAdapters)(
    "$name classifies invalid input before any request and keeps other failures unknown",
    async (adapter) => {
      const invalid = accountClient({ data: null, error: null });
      const error: unknown = await adapter
        .invalid(invalid.client)
        .catch((failure: unknown) => failure);

      expect(invalid.getUser).not.toHaveBeenCalled();
      expect(invalid.from).not.toHaveBeenCalled();
      expect(invalid.upsert).not.toHaveBeenCalled();
      expect(invalid.update).not.toHaveBeenCalled();
      expect(invalid.rpc).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(PersistenceWriteError);
      expect(getPersistenceFailureKind(error)).toBe("invalid-write");
      expect(error).not.toHaveProperty("issues");
      expect(error).not.toHaveProperty("cause");
      expect((error as Error).message).not.toContain(privateInput);
      expect(JSON.stringify(error)).not.toContain(privateInput);

      // These are provider failures, not proof that the local input is invalid.
      for (const providerError of [
        { code: "23514", message: "Check constraint failed." },
        { code: "23505", message: "Unique constraint failed." },
        { code: "400", message: "Bad request." },
        { code: "PGRST301", message: "Authentication failed." },
        { message: "A remote function does not exist." },
        { failureKind: "invalid-write", message: "Untrusted failure kind." },
      ]) {
        const provider = accountClient({ data: null, error: providerError });
        const providerFailure: unknown = await adapter
          .valid(provider.client)
          .catch((failure: unknown) => failure);
        expect(provider.getUser).toHaveBeenCalledOnce();
        expect(getPersistenceFailureKind(providerFailure)).toBe("unknown");
        expect(providerFailure).toBeInstanceOf(Error);
      }

      const unauthenticated = accountClient({ data: null, error: null });
      unauthenticated.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Sign in again." },
      });
      const authFailure: unknown = await adapter
        .valid(unauthenticated.client)
        .catch((failure: unknown) => failure);
      expect(authFailure).toBeInstanceOf(Error);
      expect(getPersistenceFailureKind(authFailure)).toBe("unknown");
      expect(unauthenticated.from).not.toHaveBeenCalled();
      expect(unauthenticated.rpc).not.toHaveBeenCalled();

      const disconnected = accountClient({ data: null, error: null });
      const networkFailure = new TypeError("Failed to fetch");
      disconnected.upsert.mockRejectedValue(networkFailure);
      disconnected.single.mockRejectedValue(networkFailure);
      disconnected.rpc.mockRejectedValue(networkFailure);
      await expect(adapter.valid(disconnected.client)).rejects.toBe(
        networkFailure,
      );
      expect(getPersistenceFailureKind(networkFailure)).toBe("unknown");

      if (adapter.missingWriteId) {
        const missingId = accountClient({ data: null, error: null });
        const idFailure: unknown = await adapter
          .missingWriteId(missingId.client)
          .catch((failure: unknown) => failure);
        expect(idFailure).toBeInstanceOf(Error);
        expect(getPersistenceFailureKind(idFailure)).toBe("unknown");
        expect(missingId.from).not.toHaveBeenCalled();
        expect(missingId.rpc).not.toHaveBeenCalled();
      }

      if (adapter.readsBack) {
        const malformedReadback = accountClient({ data: {}, error: null });
        const readbackFailure: unknown = await adapter
          .valid(malformedReadback.client)
          .catch((failure: unknown) => failure);
        expect(malformedReadback.update).toHaveBeenCalledOnce();
        expect(malformedReadback.single).toHaveBeenCalledOnce();
        expect(readbackFailure).toBeInstanceOf(Error);
        expect(getPersistenceFailureKind(readbackFailure)).toBe("unknown");
      }
    },
  );

  it.each(["PGRST202", "42883", "42703"])(
    "editTimeBlockProposal preserves capability failure %s",
    async (code) => {
      const account = accountClient({
        data: null,
        error: { code, message: "Required account capability is unavailable." },
      });
      const error: unknown = await editTimeBlockProposal(
        account.client,
        proposalId,
        proposalInput,
      ).catch((failure: unknown) => failure);

      expect(account.from).toHaveBeenCalledWith("time_block_proposals");
      expect(account.update).toHaveBeenCalledWith({
        proposed_start: start,
        proposed_end: end,
        status: "edited",
      });
      expect(error).toBeInstanceOf(PersistenceWriteError);
      expect(getPersistenceFailureKind(error)).toBe(
        "server-capability-missing",
      );
      expect((error as Error).message).toBe(
        "Required account capability is unavailable.",
      );
    },
  );
});
