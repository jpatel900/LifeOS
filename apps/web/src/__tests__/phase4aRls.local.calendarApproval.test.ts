import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

// Local-only opt-in, matching phase4aRls.local.test.ts. It runs the real
// claim_google_calendar_approval RPC and its identity trigger against the
// fully migrated schema in the Migrations + RLS lane. No Google call happens.
const local =
  process.env.RUN_SUPABASE_RLS_TESTS === "1" ? describe : describe.skip;
const areaA = "00000000-0000-4000-8000-000000000101";
const connectedAt = "2026-05-09T00:00:00.000Z";
const start = "2026-05-10T16:00:00.000Z";
const end = "2026-05-10T17:00:00.000Z";

function loopbackUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:15431";
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error(
      "Calendar approval RLS tests require an isolated loopback Supabase.",
    );
  }
  return url;
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

async function withApprovalFixture(
  run: (f: {
    userClient: SupabaseClient;
    service: SupabaseClient;
    userId: string;
    taskId: string;
    winner: string;
    sibling: string;
    connectionId: string;
    blockId: string;
    claim: (
      proposal: string,
      extra?: Record<string, unknown>,
    ) => ReturnType<SupabaseClient["rpc"]>;
    finish: (id: string) => Promise<unknown>;
    evidence: () => Promise<string[]>;
    addBlock: (status: string, eventId?: string) => Promise<unknown>;
  }) => Promise<void>,
) {
  const { client: userClient, userId } = await signInUserA();
  const service = serviceClient();
  const [taskId, winner, sibling, connectionId, blockId] = Array.from(
    { length: 5 },
    () => randomUUID(),
  );
  const claim = (proposal: string, extra: Record<string, unknown> = {}) =>
    service.rpc("claim_google_calendar_approval", {
      ...claimArgs(userId, proposal, taskId, connectionId),
      ...extra,
    });
  const finish = (id: string) =>
    must(
      service
        .from("external_write_events")
        .update({ result_status: "succeeded" })
        .eq("id", id),
    );
  const evidence = async () => {
    const { error } = await claim(sibling);
    expect(error?.code).toBe("PCA01");
    expect(error?.details).toMatch(/^checkable-v2:/);
    return (JSON.parse(error!.details.slice(13)) as { auditId: string }[]).map(
      (a) => a.auditId,
    );
  };
  const addBlock = (
    status: string,
    eventId = "lifeos" + winner.replace(/-/g, ""),
  ) =>
    must(
      userClient.from("calendar_blocks").insert({
        id: blockId,
        user_id: userId,
        area_id: areaA,
        task_id: taskId,
        proposal_id: winner,
        google_event_id: eventId,
        start_at: start,
        end_at: end,
        status,
      }),
    );
  try {
    await must(
      userClient.from("tasks").insert({
        id: taskId,
        user_id: userId,
        area_id: areaA,
        title: "Synthetic recovery",
      }),
    );
    await must(
      userClient.from("time_block_proposals").insert(
        [winner, sibling].map((id) => ({
          id,
          user_id: userId,
          area_id: areaA,
          task_id: taskId,
          proposed_start: start,
          proposed_end: end,
        })),
      ),
    );
    await must(
      service.from("google_calendar_connections").insert({
        id: connectionId,
        user_id: userId,
        calendar_id: "primary",
        status: "connected",
        connected_at: connectedAt,
        credential_verified_at: connectedAt,
        first_write_warning_acknowledged_at: connectedAt,
        encrypted_refresh_token: "synthetic-fixture-only",
      }),
    );
    await run({
      userClient,
      service,
      userId,
      taskId,
      winner,
      sibling,
      connectionId,
      blockId,
      claim,
      finish,
      evidence,
      addBlock,
    });
  } finally {
    await must(
      service
        .from("external_write_events")
        .delete()
        .in("target_id", [winner, sibling, blockId]),
    );
    await must(userClient.from("calendar_blocks").delete().eq("id", blockId));
    await must(
      userClient
        .from("time_block_proposals")
        .delete()
        .in("id", [winner, sibling]),
    );
    await must(userClient.from("tasks").delete().eq("id", taskId));
    await must(
      service
        .from("google_calendar_connections")
        .delete()
        .eq("user_id", userId)
        .eq("id", connectionId),
    );
  }
}

local("calendar approval recovery — exact evidence and origin", () => {
  it("serializes simultaneous sibling claims on independent requests", async () => {
    await withApprovalFixture(async (f) => {
      const results = await Promise.all([
        f.claim(f.winner),
        f.claim(f.sibling),
      ]);
      expect(results.filter((result) => result.error === null)).toHaveLength(1);
      expect(
        results.filter((result) => result.error?.code === "PCA01"),
      ).toHaveLength(1);
      const audits = await must(
        f.service
          .from("external_write_events")
          .select("id,result_status")
          .in("target_id", [f.winner, f.sibling]),
      );
      expect(audits).toHaveLength(1);
      expect(audits?.[0]?.result_status).toBe("pending");
    });
  });

  it("invalidates old absence when another retry finishes, including a partial voucher", async () => {
    await withApprovalFixture(async (f) => {
      const first = (await must(f.claim(f.winner))) as { id: string };
      await f.finish(first.id);
      const oldProof = await f.evidence();
      const newer = (await must(f.claim(f.winner))) as { id: string };
      await must(
        f.service
          .from("external_write_events")
          .update({ result_status: "failed" })
          .eq("id", newer.id),
      );
      expect(
        (await f.claim(f.sibling, { p_absent_attempt_ids: oldProof })).error
          ?.code,
      ).toBe("PCA01");
      const freshProof = await f.evidence();
      expect(freshProof.sort()).toEqual([first.id, newer.id].sort());
      expect(
        (await f.claim(f.sibling, { p_absent_attempt_ids: freshProof })).error,
      ).toBeNull();
    });
  });

  it.each(["generation", "calendar", "unverified"] as const)(
    "rejects %s drift even with exact prior IDs",
    async (kind) => {
      await withApprovalFixture(async (f) => {
        const first = (await must(f.claim(f.winner))) as { id: string };
        await f.finish(first.id);
        const proof = await f.evidence();
        const newer = "2026-05-11T00:00:00.000Z";
        const change =
          kind === "generation"
            ? { connected_at: newer, credential_verified_at: newer }
            : kind === "calendar"
              ? { calendar_id: "different-calendar" }
              : { credential_verified_at: null };
        await must(
          f.service
            .from("google_calendar_connections")
            .update(change)
            .eq("id", f.connectionId),
        );
        const extra =
          kind === "generation"
            ? { p_connected_at: newer }
            : kind === "calendar"
              ? { p_calendar_id: "different-calendar" }
              : {};
        const result = await f.claim(f.sibling, {
          ...extra,
          p_absent_attempt_ids: proof,
        });
        expect(result.error?.code).toBe("PCA01");
        expect(result.error?.details ?? "").not.toContain("checkable-v2:");
      });
    },
  );

  it.each(["scheduled", "running"])(
    "retires only the absent %s block with the replacement audit",
    async (status) => {
      await withApprovalFixture(async (f) => {
        const first = (await must(f.claim(f.winner))) as { id: string };
        await f.finish(first.id);
        await f.addBlock(status);
        const proof = await f.evidence();
        const before = await must(
          f.userClient
            .from("calendar_blocks")
            .select("status")
            .eq("id", f.blockId)
            .single(),
        );
        expect(before).toMatchObject({ status });
        const replacement = await f.claim(f.sibling, {
          p_absent_attempt_ids: proof,
        });
        expect(replacement.error).toBeNull();
        expect(replacement.data).toMatchObject({
          result_status: "pending",
          target_id: f.sibling,
        });
        const after = await must(
          f.userClient
            .from("calendar_blocks")
            .select("status,google_event_id")
            .eq("id", f.blockId)
            .single(),
        );
        expect(after).toMatchObject({
          status: "cancelled",
          google_event_id: "lifeos" + f.winner.replace(/-/g, ""),
        });
        // The old cancelled proposal cannot reuse its terminal Google ID.
        expect((await f.claim(f.winner)).error?.code).toBe("PCA01");
      });
    },
  );

  it("keeps a block whose event identity changed after the probe", async () => {
    await withApprovalFixture(async (f) => {
      const first = (await must(f.claim(f.winner))) as { id: string };
      await f.finish(first.id);
      await f.addBlock("scheduled");
      const proof = await f.evidence();
      await must(
        f.userClient
          .from("calendar_blocks")
          .update({ google_event_id: "different-event" })
          .eq("id", f.blockId),
      );
      expect(
        (await f.claim(f.sibling, { p_absent_attempt_ids: proof })).error?.code,
      ).toBe("PCA01");
      expect(
        (
          await must(
            f.userClient
              .from("calendar_blocks")
              .select("status")
              .eq("id", f.blockId)
              .single(),
          )
        )?.status,
      ).toBe("scheduled");
    });
  });

  it("keeps an open block with no originating insert audit", async () => {
    await withApprovalFixture(async (f) => {
      await f.addBlock("scheduled");
      const result = await f.claim(f.sibling);
      expect(result.error?.code).toBe("PCA01");
      expect(result.error?.details ?? "").not.toContain("checkable-v2:");
      expect(
        (
          await must(
            f.userClient
              .from("calendar_blocks")
              .select("status")
              .eq("id", f.blockId)
              .single(),
          )
        )?.status,
      ).toBe("scheduled");
    });
  });

  it.each(["cancelled", "completed", "missed"])(
    "keeps a pending insert reserved despite a %s block and successful deletion",
    async (status) => {
      await withApprovalFixture(async (f) => {
        const first = (await must(f.claim(f.winner))) as { id: string };
        await f.finish(first.id);
        await must(f.claim(f.winner));
        await f.addBlock(status);
        await must(
          f.service.from("external_write_events").insert({
            user_id: f.userId,
            area_id: areaA,
            provider: "google_calendar",
            operation: "calendar.events.delete",
            target_type: "calendar_block",
            target_id: f.blockId,
            result_status: "succeeded",
            request_summary_json: {
              calendar_id: "primary",
              google_event_id: "lifeos" + f.winner.replace(/-/g, ""),
            },
          }),
        );
        expect(
          (await f.claim(f.sibling, { p_absent_attempt_ids: [first.id] })).error
            ?.code,
        ).toBe("PCA01");
      });
    },
  );

  it("denies another user and protects the credential-verification marker", async () => {
    await withApprovalFixture(async (f) => {
      const other = createClient(
        loopbackUrl(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        clientOptions,
      );
      const { data, error } = await other.auth.signInWithPassword({
        email: "user_b@example.test",
        password: "password123",
      });
      expect(error).toBeNull();
      const args = claimArgs(f.userId, f.winner, f.taskId, f.connectionId);
      expect(
        (await other.rpc("claim_google_calendar_approval", args)).error,
      ).not.toBeNull();
      expect(
        (
          await f.service.rpc("claim_google_calendar_approval", {
            ...args,
            p_user_id: data.user!.id,
          })
        ).error?.code,
      ).toBe("PCA01");
      await f.addBlock("scheduled");
      expect(
        await must(
          f.userClient.from("calendar_blocks").select("id").eq("id", f.blockId),
        ),
      ).toEqual([{ id: f.blockId }]);
      expect(
        (
          await other
            .from("calendar_blocks")
            .select("id")
            .eq("user_id", f.userId)
        ).data,
      ).toEqual([]);
      expect(
        (
          await f.userClient
            .from("google_calendar_connections")
            .update({ credential_verified_at: connectedAt })
            .eq("id", f.connectionId)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await f.userClient
            .from("google_calendar_connections")
            .select("credential_verified_at")
            .eq("id", f.connectionId)
        ).error,
      ).not.toBeNull();
    });
  });
});

async function signInUserA() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("A local Supabase anon key is required.");
  const client = createClient(loopbackUrl(), key, clientOptions);
  const { data, error } = await client.auth.signInWithPassword({
    email: "user_a@example.test",
    password: "password123",
  });
  if (error) throw error;
  return { client, userId: data.user!.id };
}

function serviceClient() {
  // `supabase status -o env` exports the local stack's service key.
  const key = process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
  if (!key) {
    throw new Error(
      "The local Supabase service key is required for the claim RPC test.",
    );
  }
  return createClient(loopbackUrl(), key, clientOptions);
}

function claimArgs(
  userId: string,
  proposalId: string,
  taskId: string,
  connectionId: string,
) {
  return {
    p_user_id: userId,
    p_proposal_id: proposalId,
    p_task_id: taskId,
    p_start: start,
    p_end: end,
    p_connection_id: connectionId,
    p_connected_at: connectedAt,
    p_calendar_id: "primary",
    p_request_summary: { marker: "calendar-approval-rls" },
  };
}

async function must<T>(
  promise: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

local("calendar approval claim — real local PostgreSQL", () => {
  it("lets one sibling approval win, keeps its retry safe and freezes its time", async () => {
    const { client: userClient, userId } = await signInUserA();
    const service = serviceClient();
    const taskId = randomUUID();
    const otherTaskId = randomUUID();
    const winner = randomUUID();
    const sibling = randomUUID();
    const independent = randomUUID();
    const proposalIds = [winner, sibling, independent];
    let connectionId: string | null = null;
    try {
      await must(
        userClient.from("tasks").insert([
          { id: taskId, user_id: userId, area_id: areaA, title: "Synthetic" },
          {
            id: otherTaskId,
            user_id: userId,
            area_id: areaA,
            title: "Synthetic independent",
          },
        ]),
      );
      await must(
        userClient.from("time_block_proposals").insert(
          [
            [winner, taskId],
            [sibling, taskId],
            [independent, otherTaskId],
          ].map(([id, task]) => ({
            id,
            user_id: userId,
            area_id: areaA,
            task_id: task,
            proposed_start: start,
            proposed_end: end,
          })),
        ),
      );
      const connection = await must(
        service
          .from("google_calendar_connections")
          .insert({
            user_id: userId,
            calendar_id: "primary",
            status: "connected",
            connected_at: connectedAt,
            credential_verified_at: connectedAt,
            first_write_warning_acknowledged_at: connectedAt,
            encrypted_refresh_token: "synthetic-fixture-only",
          })
          .select("id")
          .single(),
      );
      connectionId = (connection as { id: string }).id;

      // Only the server (service role) may claim; a signed-in browser cannot.
      const denied = await userClient.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, winner, taskId, connectionId),
      );
      expect(denied.error).not.toBeNull();

      const first = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, winner, taskId, connectionId),
      );
      expect(first.error).toBeNull();
      expect(first.data).toMatchObject({
        result_status: "pending",
        target_id: winner,
        operation: "calendar.events.insert",
      });

      const blocked = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, sibling, taskId, connectionId),
      );
      expect(blocked.error?.code).toBe("PCA01");

      const retry = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, winner, taskId, connectionId),
      );
      expect(retry.error).toBeNull();

      const otherTask = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, independent, otherTaskId, connectionId),
      );
      expect(otherTask.error).toBeNull();

      // The signed-in "Move later" path: once a Google insert was attempted,
      // the proposal's time is frozen.
      const moved = await userClient
        .from("time_block_proposals")
        .update({ proposed_start: "2026-05-10T15:00:00.000Z" })
        .eq("id", winner);
      expect(moved.error?.code).toBe("PCA01");

      const statusOnly = await userClient
        .from("time_block_proposals")
        .update({ status: "accepted" })
        .eq("id", winner);
      expect(statusOnly.error).toBeNull();

      // Review round 3: once the winner's attempts have finished, the
      // conflict names them as checkable, and a retry vouching (after the
      // route has asked Google) that their event is gone is allowed.
      await must(
        service
          .from("external_write_events")
          .update({ result_status: "succeeded" })
          .eq("target_id", winner),
      );
      const checkable = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, sibling, taskId, connectionId),
      );
      expect(checkable.error?.code).toBe("PCA01");
      expect(checkable.error?.details).toMatch(/^checkable-v2:/);
      const attempts = JSON.parse(checkable.error!.details.slice(13)) as {
        auditId: string;
        proposalId: string;
      }[];
      expect(attempts.map((attempt) => attempt.auditId).sort()).toEqual(
        [first.data.id, retry.data.id].sort(),
      );
      expect(attempts.every((attempt) => attempt.proposalId === winner)).toBe(
        true,
      );
      const vouched = await service.rpc("claim_google_calendar_approval", {
        ...claimArgs(userId, sibling, taskId, connectionId),
        p_absent_attempt_ids: attempts.map((attempt) => attempt.auditId),
      });
      expect(vouched.error).toBeNull();
    } finally {
      await must(
        service
          .from("external_write_events")
          .delete()
          .in("target_id", proposalIds),
      );
      await must(
        userClient.from("time_block_proposals").delete().in("id", proposalIds),
      );
      await must(
        userClient.from("tasks").delete().in("id", [taskId, otherTaskId]),
      );
      if (connectionId) {
        await must(
          service
            .from("google_calendar_connections")
            .delete()
            .eq("id", connectionId),
        );
      }
    }
  });

  it("frees the task after a proven-not-created attempt or a completed event", async () => {
    const { client: userClient, userId } = await signInUserA();
    const service = serviceClient();
    const rejectedTask = randomUUID();
    const completedTask = randomUUID();
    const [rejected, rejectedSibling, completed, completedSibling] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    const proposalIds = [
      rejected,
      rejectedSibling,
      completed,
      completedSibling,
    ];
    const blockId = randomUUID();
    let connectionId: string | null = null;
    try {
      await must(
        userClient.from("tasks").insert(
          [rejectedTask, completedTask].map((id) => ({
            id,
            user_id: userId,
            area_id: areaA,
            title: "Synthetic",
          })),
        ),
      );
      await must(
        userClient.from("time_block_proposals").insert(
          [
            [rejected, rejectedTask],
            [rejectedSibling, rejectedTask],
            [completed, completedTask],
            [completedSibling, completedTask],
          ].map(([id, task]) => ({
            id,
            user_id: userId,
            area_id: areaA,
            task_id: task,
            proposed_start: start,
            proposed_end: end,
          })),
        ),
      );
      const connection = await must(
        service
          .from("google_calendar_connections")
          .insert({
            user_id: userId,
            calendar_id: "primary",
            status: "connected",
            connected_at: connectedAt,
            credential_verified_at: connectedAt,
            first_write_warning_acknowledged_at: connectedAt,
            encrypted_refresh_token: "synthetic-fixture-only",
          })
          .select("id")
          .single(),
      );
      connectionId = (connection as { id: string }).id;

      // Google refused the insert outright: nothing to reserve.
      const first = await must(
        service.rpc(
          "claim_google_calendar_approval",
          claimArgs(userId, rejected, rejectedTask, connectionId),
        ),
      );
      await must(
        service
          .from("external_write_events")
          .update({
            result_status: "failed",
            result_summary_json: { provider_event_created: false },
          })
          .eq("id", (first as { id: string }).id),
      );
      const moved = await userClient
        .from("time_block_proposals")
        .update({ proposed_start: "2026-05-10T15:30:00.000Z" })
        .eq("id", rejected);
      expect(moved.error).toBeNull();
      const sibling = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, rejectedSibling, rejectedTask, connectionId),
      );
      expect(sibling.error).toBeNull();

      // The earlier event ran its course: a new time may go to Google.
      const done = await must(
        service.rpc(
          "claim_google_calendar_approval",
          claimArgs(userId, completed, completedTask, connectionId),
        ),
      );
      await must(
        service
          .from("external_write_events")
          .update({ result_status: "succeeded" })
          .eq("id", (done as { id: string }).id),
      );
      await must(
        userClient.from("calendar_blocks").insert({
          id: blockId,
          user_id: userId,
          area_id: areaA,
          proposal_id: completed,
          task_id: completedTask,
          google_event_id: `lifeos${completed.replace(/-/g, "")}`,
          start_at: start,
          end_at: end,
          status: "completed",
        }),
      );
      const next = await service.rpc(
        "claim_google_calendar_approval",
        claimArgs(userId, completedSibling, completedTask, connectionId),
      );
      expect(next.error).toBeNull();
    } finally {
      await must(
        service
          .from("external_write_events")
          .delete()
          .in("target_id", proposalIds),
      );
      await must(userClient.from("calendar_blocks").delete().eq("id", blockId));
      await must(
        userClient.from("time_block_proposals").delete().in("id", proposalIds),
      );
      await must(
        userClient
          .from("tasks")
          .delete()
          .in("id", [rejectedTask, completedTask]),
      );
      if (connectionId) {
        await must(
          service
            .from("google_calendar_connections")
            .delete()
            .eq("id", connectionId),
        );
      }
    }
  });
});
