// W3-16 findings 3 and 5, against a REAL local Supabase stack.
//
// Runs only in the "Migrations + RLS" lane (`pnpm --filter @lifeos/web test
// phase4aRls.local` with RUN_SUPABASE_RLS_TESTS=1), never against a shared or
// production database. Both scenarios write only synthetic rows and clean up.
//
// Known-bug convention in this file: the scenario and its harness checks run
// as ordinary assertions, so a broken harness fails loudly. Only the single
// assertion that names the bug goes through `expectKnownBug`, which passes
// while the bug is present and FAILS once it is fixed. When that happens,
// replace `expectKnownBug(() => X)` with `X`. (Plain `it.fails` would also
// pass on a broken harness, and this lane cannot be probed locally.)
import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { buildUserDataExport } from "@/lib/data/export";

const execFileAsync = promisify(execFile);

const runLocalRlsTests = process.env.RUN_SUPABASE_RLS_TESTS === "1";
// QA doctrine #269: deliberate local RLS opt-in gate; default runs skip until RUN_SUPABASE_RLS_TESTS=1 provides local Supabase proof.
const describeLocalRls = runLocalRlsTests ? describe : describe.skip;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:15431";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Local stack only: `supabase status -o env` exports DB_URL in CI.
const localDbUrl =
  process.env.DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:15433/postgres";

const userA = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "user_a@example.test",
  password: "password123",
  areaId: "00000000-0000-4000-8000-000000000101",
};
const userB = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "user_b@example.test",
  password: "password123",
  areaId: "00000000-0000-4000-8000-000000000201",
};

function expectKnownBug(check: () => void) {
  let threw = false;
  try {
    check();
  } catch {
    threw = true;
  }
  expect(
    threw,
    "KNOWN BUG fixed: this assertion now passes. Replace expectKnownBug(() => X) with X.",
  ).toBe(true);
}

function createLocalClient() {
  if (!supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required when RUN_SUPABASE_RLS_TESTS=1.",
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `lifeos-rls-w316-${Math.random().toString(16).slice(2)}`,
    },
  });
}

async function signIn(email: string, password: string) {
  const client = createLocalClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return client;
}

/** A fresh local-only account, so a large seed never touches A's or B's rows. */
async function signUpFreshUser(suffix: string) {
  const client = createLocalClient();
  const email = `w316-export-${suffix}@example.test`;
  const { data, error } = await client.auth.signUp({
    email,
    password: "password123",
  });
  if (error || !data.session || !data.user) {
    throw new Error(
      `Local sign-up did not return a session: ${error?.message ?? "no session"}`,
    );
  }
  return { client, userId: data.user.id };
}

function configuredMaxRows() {
  // The local API cap this stack runs with: supabase/config.toml [api].
  const config = readFileSync(
    resolve(__dirname, "../../../../supabase/config.toml"),
    "utf8",
  );
  const match = config.match(/^\s*max_rows\s*=\s*(\d+)/m);
  if (!match) throw new Error("supabase/config.toml has no [api] max_rows");
  return Number(match[1]);
}

async function psql(sql: string) {
  const { stdout } = await execFileAsync(
    "psql",
    [localDbUrl, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { timeout: 20_000 },
  );
  return stdout.trim();
}

describeLocalRls("W3-16 #3: full export above the API row cap", () => {
  it("exports every one of the user's rows, exactly once, and none of another user's", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cap = configuredMaxRows();
    const { client, userId } = await signUpFreshUser(suffix);
    const userBClient = await signIn(userB.email, userB.password);
    const titlePrefix = `w316-export-${suffix}-`;
    const sentinelTitle = `w316-export-sentinel-b-${suffix}`;

    const areaId = crypto.randomUUID();
    const { error: areaError } = await client.from("areas").insert({
      id: areaId,
      user_id: userId,
      name: "Export cap area",
      slug: `export-cap-${suffix}`,
      color: "#2563eb",
      icon: "briefcase",
      sort_order: 0,
      is_active: true,
    });
    expect(areaError).toBeNull();

    const expectedTitles = Array.from(
      { length: cap + 1 },
      (_, index) => `${titlePrefix}${index}`,
    );
    try {
      for (let start = 0; start < expectedTitles.length; start += 250) {
        const { error } = await client.from("tasks").insert(
          expectedTitles.slice(start, start + 250).map((title) => ({
            user_id: userId,
            area_id: areaId,
            title,
            status: "active",
          })),
        );
        expect(error).toBeNull();
      }
      const { error: sentinelError } = await userBClient.from("tasks").insert({
        user_id: userB.id,
        area_id: userB.areaId,
        title: sentinelTitle,
        status: "active",
      });
      expect(sentinelError).toBeNull();

      // Harness check: the database really holds cap + 1 rows for this user.
      const { count, error: countError } = await client
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .like("title", `${titlePrefix}%`);
      expect(countError).toBeNull();
      expect(count).toBe(cap + 1);

      const exported = await buildUserDataExport(client);
      const titles = (exported.tables.tasks as Array<{ title: string }>).map(
        (row) => row.title,
      );

      expect(titles).not.toContain(sentinelTitle);
      expect(new Set(titles).size).toBe(titles.length);
      // Another populated table comes through, unmixed with tasks.
      expect(
        (exported.tables.areas as Array<{ id: string }>).map((row) => row.id),
      ).toContain(areaId);
      // KNOWN BUG (W3-16 #3): one unpaginated select per table returns at
      // most `max_rows` rows, so the export silently drops the rest.
      expectKnownBug(() =>
        expect(
          titles.filter((title) => title.startsWith(titlePrefix)),
        ).toHaveLength(cap + 1),
      );
    } finally {
      await client.from("tasks").delete().like("title", `${titlePrefix}%`);
      await client.from("areas").delete().eq("id", areaId);
      await userBClient.from("tasks").delete().eq("title", sentinelTitle);
    }
  }, 120_000);
});

describeLocalRls(
  "W3-16 #5: two clients replay one execution-session key at the same time",
  () => {
    it("records one session and acknowledges both callers with it", async () => {
      // Fails loudly (never skips) when psql is missing: GitHub's ubuntu
      // runners ship it; a local run needs a Postgres client on PATH.
      await psql("select 1");

      const clientOne = await signIn(userA.email, userA.password);
      const clientTwo = await signIn(userA.email, userA.password);
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const notes = `w316-concurrent-session-${suffix}`;
      const appName = `w316-holder-${suffix}`.slice(0, 60);

      const { data: task, error: taskError } = await clientOne
        .from("tasks")
        .insert({
          user_id: userA.id,
          area_id: userA.areaId,
          title: `w316-concurrent-task-${suffix}`,
          status: "active",
          estimated_minutes_high: 30,
        })
        .select("id")
        .single();
      expect(taskError).toBeNull();
      const taskId = task!.id as string;

      // The holder locks the task row (the same `for update` the function
      // takes), then waits inside SQL until BOTH replays are blocked on that
      // lock, and only then commits. If the overlap is never reached it raises,
      // so a run that did not really overlap fails instead of passing.
      const holderSql = `
        begin;
        select id from public.tasks where id = '${taskId}' for update;
        do $$
        declare waiting integer := 0; attempts integer := 0;
        begin
          loop
            perform pg_stat_clear_snapshot();
            select count(*) into waiting
            from pg_stat_activity
            where wait_event_type = 'Lock'
              and query ilike '%record_execution_session%'
              and pid <> pg_backend_pid();
            exit when waiting >= 2 or attempts >= 100;
            perform pg_sleep(0.05);
            attempts := attempts + 1;
          end loop;
          if waiting < 2 then
            raise exception 'overlap not reached: % replays waiting', waiting;
          end if;
        end $$;
        commit;
      `;
      const holder = spawn(
        "psql",
        [localDbUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
        { env: { ...process.env, PGAPPNAME: appName } },
      );
      let holderStderr = "";
      holder.stderr.on("data", (chunk) => {
        holderStderr += String(chunk);
      });
      const holderExit = new Promise<number | null>((resolve) =>
        holder.on("close", resolve),
      );
      holder.stdin.end(holderSql);

      try {
        // Start the replays only once the holder owns the lock: its session
        // is running the wait loop, which comes after the `for update`.
        let holderWaiting = false;
        for (let attempt = 0; attempt < 100 && !holderWaiting; attempt += 1) {
          holderWaiting =
            (await psql(
              `select count(*) from pg_stat_activity where application_name = '${appName}' and query ilike '%pg_stat_clear_snapshot%'`,
            )) === "1";
        }
        expect(holderWaiting, "the lock holder never started").toBe(true);

        const args = {
          p_task_id: taskId,
          p_calendar_block_id: null,
          p_outcome: "partial",
          p_actual_minutes: 12,
          p_paused_minutes: 0,
          p_distraction_minutes: 0,
          p_productivity_rating: 1,
          p_notes: notes,
          p_cap_outcome: null,
          p_client_write_id: `journal-session-${suffix}`,
          p_defer_task: false,
        };
        const [one, two] = await Promise.all([
          clientOne.rpc("record_execution_session", args),
          clientTwo.rpc("record_execution_session", args),
        ]);

        // Harness check: the holder saw both replays blocked, then committed.
        expect(await holderExit, holderStderr).toBe(0);

        const { data: rows, error: selectError } = await clientOne
          .from("execution_sessions")
          .select("id,outcome")
          .eq("notes", notes);
        expect(selectError).toBeNull();
        // Exactly one logical session, whatever the callers were told.
        expect(rows).toHaveLength(1);

        // KNOWN BUG (W3-16 #5): the replay short-circuit runs BEFORE the
        // task lock, so the second replay inserts after the first commits and
        // hits the (user_id, client_write_id) unique index instead of being
        // acknowledged as a duplicate.
        expectKnownBug(() => {
          expect(one.error).toBeNull();
          expect(two.error).toBeNull();
          expect(
            [one.data?.deduplicated, two.data?.deduplicated].sort(),
          ).toEqual([false, true]);
          expect(one.data?.session?.id).toBe(two.data?.session?.id);
        });
      } finally {
        holder.kill();
        await clientOne.from("execution_sessions").delete().eq("notes", notes);
        await clientOne.from("tasks").delete().eq("id", taskId);
      }
    }, 60_000);
  },
);
