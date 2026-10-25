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
      expect(checkable.error?.details).toMatch(
        new RegExp(`^checkable:${winner}`),
      );
      const vouched = await service.rpc("claim_google_calendar_approval", {
        ...claimArgs(userId, sibling, taskId, connectionId),
        p_absent_proposal_ids: [winner],
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
