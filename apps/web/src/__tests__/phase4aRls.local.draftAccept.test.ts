import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

// Local-only opt-in, matching phase4aRls.local.test.ts. Mock green is not RLS proof.
const local =
  process.env.RUN_SUPABASE_RLS_TESTS === "1" ? describe : describe.skip;
const areaA = "00000000-0000-4000-8000-000000000101";
const areaB = "00000000-0000-4000-8000-000000000201";
async function signIn(which: "a" | "b") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:15431";
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error(
      "Draft acceptance RLS tests require an isolated loopback Supabase.",
    );
  }
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("A local Supabase anon key is required.");
  const client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: `user_${which}@example.test`,
    password: "password123",
  });
  if (error) throw error;
  return client;
}
function args(key: string, area = areaA, capture: string | null = null) {
  return {
    p_task: {
      client_write_id: key,
      area_id: area,
      source_capture_item_id: capture,
      title: "Synthetic atomic acceptance",
      description: null,
      status: "active",
      priority_confidence: null,
      task_type: "task",
      is_reversible: null,
      due_at: null,
      estimated_minutes_low: 10,
      estimated_minutes_high: 20,
      first_tiny_step: null,
      definition_of_done: "Synthetic completion check",
      is_commitment: false,
    },
    p_person_mentions: [
      { name: key, normalized_name: key, role: "waiting_on" },
    ],
    p_accepted_at: "2026-10-23T00:00:00.000Z",
    p_proposal: {
      proposed_start: "2026-10-24T16:00:00.000Z",
      proposed_end: "2026-10-24T16:30:00.000Z",
      rationale: "Synthetic proposal",
    },
  };
}
async function clean(client: SupabaseClient, key: string, capture?: string) {
  for (const [table, column, value] of [
    ["time_block_proposals", "client_write_id", `${key}:proposal`],
    ["tasks", "client_write_id", key],
    ["people", "normalized_name", key],
    ...(capture ? [["capture_items", "id", capture]] : []),
  ]) {
    const { error } = await client.from(table).delete().eq(column, value);
    if (error) throw error;
  }
}
async function capture(client: SupabaseClient, status = "parsed") {
  const { data: auth } = await client.auth.getUser();
  const id = randomUUID();
  const { error } = await client.from("capture_items").insert({
    id,
    user_id: auth.user!.id,
    area_id: areaA,
    raw_text: "Synthetic acceptance fixture",
    capture_mode: "text",
    status,
  });
  if (error) throw error;
  return id;
}

local("atomic draft acceptance — real local PostgreSQL", () => {
  it("rolls back people and task when a later proposal insert fails", async () => {
    const client = await signIn("a");
    const key = randomUUID();
    const captureId = await capture(client);
    try {
      const input = args(key, areaA, captureId);
      input.p_proposal.proposed_end = "2026-10-24T15:00:00.000Z";
      const { error } = await client.rpc("accept_task_draft", input);
      expect(error?.code).toBe("23514");
      for (const [table, column, value] of [
        ["people", "normalized_name", key],
        ["tasks", "client_write_id", key],
        ["time_block_proposals", "client_write_id", `${key}:proposal`],
      ]) {
        const result = await client.from(table).select("id").eq(column, value);
        expect(result.error).toBeNull();
        expect(result.data).toEqual([]);
      }
      const remaining = await client
        .from("capture_items")
        .select("status")
        .eq("id", captureId)
        .single();
      expect(remaining.error).toBeNull();
      expect(remaining.data?.status).toBe("parsed");
    } finally {
      await clean(client, key, captureId);
    }
  });

  it("serializes same-key replay and returns one task/proposal/person", async () => {
    const client = await signIn("a");
    const key = randomUUID();
    const captureId = await capture(client);
    try {
      const results = await Promise.all([
        client.rpc("accept_task_draft", args(key, areaA, captureId)),
        client.rpc("accept_task_draft", args(key, areaA, captureId)),
      ]);
      results.forEach((result) => expect(result.error).toBeNull());
      expect(results[0].data.task.id).toBe(results[1].data.task.id);
      expect(results[0].data.proposal.id).toBe(results[1].data.proposal.id);
      expect(results.map((result) => result.data.deduplicated).sort()).toEqual([
        false,
        true,
      ]);
      expect(results[0].data.task.definition_of_done).toBe(
        "Synthetic completion check",
      );
      const people = await client
        .from("people")
        .select("id")
        .eq("normalized_name", key);
      expect(people.error).toBeNull();
      expect(people.data).toHaveLength(1);
      const state = await client
        .from("capture_items")
        .select("status")
        .eq("id", captureId)
        .single();
      expect(state.error).toBeNull();
      expect(state.data?.status).toBe("resolved");
    } finally {
      await clean(client, key, captureId);
    }
  });

  it("accepts a backlog draft with no proposal and still resolves its capture", async () => {
    const client = await signIn("a");
    const key = randomUUID();
    const captureId = await capture(client);
    try {
      const input = args(key, areaA, captureId);
      const { data, error } = await client.rpc("accept_task_draft", {
        ...input,
        p_task: { ...input.p_task, status: "backlog" },
        p_proposal: null,
      });
      expect(error).toBeNull();
      expect(data.task.status).toBe("backlog");
      // An unassigned proposal row must come back as null, not an object of
      // nulls that the client would then fail to parse after the commit.
      expect(data.proposal).toBeNull();
      const state = await client
        .from("capture_items")
        .select("status")
        .eq("id", captureId)
        .single();
      expect(state.error).toBeNull();
      expect(state.data?.status).toBe("resolved");
    } finally {
      await clean(client, key, captureId);
    }
  });

  it("repairs a legacy partial accept, preserves later task edits and links a late capture", async () => {
    const client = await signIn("a");
    const key = randomUUID();
    const captureId = await capture(client, "archived");
    try {
      const { data: auth } = await client.auth.getUser();
      const seeded = await client
        .from("tasks")
        .insert({
          ...args(key).p_task,
          user_id: auth.user!.id,
          title: "Later edited title",
          status: "backlog",
        })
        .select("id")
        .single();
      expect(seeded.error).toBeNull();
      const repaired = await client.rpc(
        "accept_task_draft",
        args(key, areaA, captureId),
      );
      expect(repaired.error).toBeNull();
      expect(repaired.data).toMatchObject({
        deduplicated: true,
        task: {
          id: seeded.data!.id,
          title: "Later edited title",
          status: "backlog",
          source_capture_item_id: captureId,
        },
      });
      const state = await client
        .from("capture_items")
        .select("status")
        .eq("id", captureId)
        .single();
      expect(state.error).toBeNull();
      expect(state.data?.status).toBe("archived");
      // Stale/temporarily unresolved journal fields cannot undo committed identity.
      const replay = await client.rpc("accept_task_draft", args(key, areaB));
      expect(replay.error).toBeNull();
      expect(replay.data.task.area_id).toBe(areaA);
      expect(replay.data.task.source_capture_item_id).toBe(captureId);
      expect(replay.data.proposal.id).toBe(repaired.data.proposal.id);
    } finally {
      await clean(client, key, captureId);
    }
  });

  it.each(["accepted", "rejected"])(
    "preserves a proposal already %s during replay",
    async (status) => {
      const client = await signIn("a");
      const key = randomUUID();
      try {
        const first = await client.rpc("accept_task_draft", args(key));
        expect(first.error).toBeNull();
        const changed = await client
          .from("time_block_proposals")
          .update({ status })
          .eq("id", first.data.proposal.id)
          .select("id")
          .single();
        expect(changed.error).toBeNull();
        const replay = await client.rpc("accept_task_draft", args(key));
        expect(replay.error).toBeNull();
        expect(replay.data.proposal).toMatchObject({
          id: first.data.proposal.id,
          status,
        });
        expect(replay.data.deduplicated).toBe(true);
      } finally {
        await clean(client, key);
      }
    },
  );

  it("denies another user's area and capture while scoping replay keys per user", async () => {
    const a = await signIn("a");
    const b = await signIn("b");
    const key = randomUUID();
    const captureId = await capture(a);
    try {
      expect(
        (await b.rpc("accept_task_draft", args(key, areaA))).error,
      ).not.toBeNull();
      expect(
        (await b.rpc("accept_task_draft", args(key, areaB, captureId))).error,
      ).not.toBeNull();
      const failedTasks = await b
        .from("tasks")
        .select("id")
        .eq("client_write_id", key);
      expect(failedTasks.error).toBeNull();
      expect(failedTasks.data).toEqual([]);
      for (const [table, column, value] of [
        ["people", "normalized_name", key],
        ["time_block_proposals", "client_write_id", `${key}:proposal`],
      ]) {
        const remaining = await b.from(table).select("id").eq(column, value);
        expect(remaining.error).toBeNull();
        expect(remaining.data).toEqual([]);
      }
      const first = await a.rpc(
        "accept_task_draft",
        args(key, areaA, captureId),
      );
      const second = await b.rpc("accept_task_draft", args(key, areaB));
      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(first.data.task.id).not.toBe(second.data.task.id);
    } finally {
      await clean(a, key, captureId);
      await clean(b, key);
    }
  });
});
