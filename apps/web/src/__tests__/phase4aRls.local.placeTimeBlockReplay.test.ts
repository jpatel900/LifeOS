// Real database proof for W7-2, selected by CI's Migrations + RLS lane.
// No mocked SQL: a holder forces two authenticated RPCs to overlap on the
// same task lock. Only synthetic seeded accounts and task-scoped rows are used.
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const runLocalRlsTests = process.env.RUN_SUPABASE_RLS_TESTS === "1";
// QA doctrine #269: deliberate local RLS opt-in gate; default runs skip until RUN_SUPABASE_RLS_TESTS=1 provides local Supabase proof.
const describeLocalRls = runLocalRlsTests ? describe : describe.skip;
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:15431";
const localDbUrl =
  process.env.DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:15433/postgres";
const userA = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user_a@example.test",
  areaId: "00000000-0000-4000-8000-000000000101",
};
const userB = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "user_b@example.test",
  areaId: "00000000-0000-4000-8000-000000000201",
};

function requireLocalStack() {
  for (const value of [supabaseUrl, localDbUrl]) {
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)
    ) {
      throw new Error(
        "Placement replay tests require an isolated local stack.",
      );
    }
  }
}

async function signIn(user: typeof userA) {
  requireLocalStack();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("The database lane requires a local anon key.");
  const client = createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `w72-${randomUUID()}`,
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: "password123",
  });
  expect(error).toBeNull();
  return client;
}

async function seedTask(client: SupabaseClient, user: typeof userA) {
  const { data, error } = await client
    .from("tasks")
    .insert({
      user_id: user.id,
      area_id: user.areaId,
      title: `w72-placement-${randomUUID()}`,
      status: "active",
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  return data!.id as string;
}

function placementArgs(
  taskId: string,
  key: string,
  proposalId: string | null = null,
) {
  return {
    p_task_id: taskId,
    p_proposal_id: proposalId,
    p_proposed_start: "2026-05-08T14:00:00.000Z",
    p_proposed_end: "2026-05-08T15:00:00.000Z",
    p_rationale: "Synthetic concurrent replay",
    p_client_write_id: key,
  };
}

async function cleanup(client: SupabaseClient, taskId: string) {
  // Delete children first: the task foreign keys use SET NULL.
  for (const table of ["calendar_blocks", "time_block_proposals", "tasks"]) {
    const { error } = await client
      .from(table)
      .delete()
      .eq(table === "tasks" ? "id" : "task_id", taskId);
    expect(error, `clean up ${table}`).toBeNull();
  }
}

async function psql(sql: string) {
  requireLocalStack();
  const { stdout } = await execFileAsync(
    "psql",
    [localDbUrl, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { timeout: 10_000 },
  );
  return stdout.trim();
}

async function holdUntilBothReplaysWait(taskId: string) {
  const appName = `w72-holder-${randomUUID()}`;
  const holder = spawn(
    "psql",
    [localDbUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { env: { ...process.env, PGAPPNAME: appName }, timeout: 25_000 },
  );
  let stderr = "";
  holder.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  holder.stdin.on("error", (error) => {
    stderr += error.message;
  });
  const closed = new Promise<number | null>((resolve) => {
    holder.once("error", (error) => {
      stderr += error.message;
      resolve(-1);
    });
    holder.once("close", resolve);
  });
  holder.stdout.resume();
  holder.stdin.end(`
    begin;
    set local statement_timeout = '20s';
    select id from public.tasks where id = '${taskId}' for update;
    do $$
    declare waiting integer := 0; attempts integer := 0;
    begin
      loop
        perform pg_stat_clear_snapshot();
        -- Include indirect waiters: the second RPC may queue behind the
        -- first RPC's tuple lock, rather than directly behind this holder.
        with recursive blocked(pid) as (
          select a.pid from pg_stat_activity a
          where pg_backend_pid() = any(pg_blocking_pids(a.pid))
          union
          select a.pid from pg_stat_activity a
          join blocked b on b.pid = any(pg_blocking_pids(a.pid))
        )
        select count(*) into waiting from blocked b
        join pg_stat_activity a on a.pid = b.pid
        where a.wait_event_type = 'Lock'
          and a.query ilike '%place_time_block%';
        exit when waiting >= 2 or attempts >= 300;
        perform pg_sleep(0.05);
        attempts := attempts + 1;
      end loop;
      if waiting < 2 then
        raise exception 'overlap not reached: % replays waiting', waiting;
      end if;
    end $$;
    commit;
  `);
  const stop = async () => {
    if (holder.exitCode === null) holder.kill();
    await closed;
  };
  try {
    // Observe the wait loop, which starts only AFTER acquiring the task lock.
    await expect
      .poll(
        () =>
          psql(`select count(*) from pg_stat_activity
        where application_name = '${appName}' and state = 'active'
          and query ilike '%do $$%pg_stat_clear_snapshot%'`),
        { timeout: 5_000, interval: 50 },
      )
      .toBe("1");
  } catch (error) {
    await stop();
    throw error;
  }
  return {
    stop,
    assertOverlap: async () => expect(await closed, stderr).toBe(0),
  };
}

describeLocalRls("place_time_block concurrent replay", () => {
  it.each([false, true])(
    "returns one placement to both callers (existing proposal: %s)",
    async (existingProposal) => {
      await psql("select 1");
      const one = await signIn(userA);
      const two = await signIn(userA);
      const taskId = await seedTask(one, userA);
      let holder:
        | Awaited<ReturnType<typeof holdUntilBothReplaysWait>>
        | undefined;
      try {
        const args = placementArgs(taskId, `w72-${randomUUID()}`);
        if (existingProposal) {
          const { data, error } = await one
            .from("time_block_proposals")
            .insert({
              user_id: userA.id,
              area_id: userA.areaId,
              task_id: taskId,
              proposed_start: args.p_proposed_start,
              proposed_end: args.p_proposed_end,
              status: "proposed",
            })
            .select("id")
            .single();
          expect(error).toBeNull();
          args.p_proposal_id = data!.id;
        }
        holder = await holdUntilBothReplaysWait(taskId);
        const [first, second] = await Promise.all([
          one
            .rpc("place_time_block", args)
            .abortSignal(AbortSignal.timeout(25_000)),
          two
            .rpc("place_time_block", args)
            .abortSignal(AbortSignal.timeout(25_000)),
        ]);
        await holder.assertOverlap();
        expect(first.error).toBeNull();
        expect(second.error).toBeNull();
        expect(
          [first.data?.deduplicated, second.data?.deduplicated].sort(),
        ).toEqual([false, true]);
        expect(first.data.proposal.id).toBe(second.data.proposal.id);
        expect(first.data.block.id).toBe(second.data.block.id);
        if (existingProposal)
          expect(first.data.proposal.id).toBe(args.p_proposal_id);
        for (const table of ["time_block_proposals", "calendar_blocks"]) {
          const { data, error } = await one
            .from(table)
            .select("id")
            .eq("task_id", taskId);
          expect(error).toBeNull();
          expect(data).toHaveLength(1);
        }
        const { data: task, error } = await one
          .from("tasks")
          .select("status")
          .eq("id", taskId)
          .single();
        expect(error).toBeNull();
        expect(task?.status).toBe("scheduled");

        // Preserve the early replay contract: already-saved work wins even
        // when the caller's task/proposal arguments no longer resolve.
        const replay = await one.rpc("place_time_block", {
          ...args,
          p_task_id: randomUUID(),
          p_proposal_id: randomUUID(),
        });
        expect(replay.error).toBeNull();
        expect(replay.data?.deduplicated).toBe(true);
        expect(replay.data?.proposal.id).toBe(first.data.proposal.id);
        expect(replay.data?.block.id).toBe(first.data.block.id);
      } finally {
        await holder?.stop();
        await cleanup(one, taskId);
      }
    },
    60_000,
  );

  it("scopes a replay key to its owner and refuses another user's task", async () => {
    const one = await signIn(userA);
    const two = await signIn(userB);
    const taskA = await seedTask(one, userA);
    let taskB: string | undefined;
    try {
      taskB = await seedTask(two, userB);
      const key = `w72-owner-${randomUUID()}`;
      const first = await one.rpc(
        "place_time_block",
        placementArgs(taskA, key),
      );
      expect(first.error).toBeNull();
      const denied = await two.rpc(
        "place_time_block",
        placementArgs(taskA, key),
      );
      expect(denied.error?.message).toBe("Planning task was not found.");
      const second = await two.rpc(
        "place_time_block",
        placementArgs(taskB, key),
      );
      expect(second.error).toBeNull();
      expect(first.data?.deduplicated).toBe(false);
      expect(second.data?.deduplicated).toBe(false);
      expect(first.data.proposal.user_id).toBe(userA.id);
      expect(second.data.proposal.user_id).toBe(userB.id);
      expect(first.data.proposal.id).not.toBe(second.data.proposal.id);
      for (const table of ["time_block_proposals", "calendar_blocks"]) {
        for (const [client, otherTask] of [
          [one, taskB],
          [two, taskA],
        ] as const) {
          const { data, error } = await client
            .from(table)
            .select("id")
            .eq("task_id", otherTask);
          expect(error).toBeNull();
          expect(data).toEqual([]);
        }
      }
    } finally {
      if (taskB) await cleanup(two, taskB);
      await cleanup(one, taskA);
    }
  }, 30_000);
});
