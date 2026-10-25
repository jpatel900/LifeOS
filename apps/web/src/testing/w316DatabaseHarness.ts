// Test-only I/O and assertions shared by the real local RLS scenarios and
// fake-only harness regressions. No product module imports this file.
import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { expect } from "vitest";

export type LocalRlsTargets = {
  supabaseUrl: string;
  supabaseAnonKey?: string;
  localDbUrl: string;
};

const execFileAsync = promisify(execFile);

function localUrl(raw: string, database: boolean) {
  const field = database ? "DB_URL" : "NEXT_PUBLIC_SUPABASE_URL";
  try {
    // Reject forms whose interpretation can differ between URL and libpq.
    if (/[\s\\]/.test(raw)) throw new Error();
    const url = new URL(raw);
    const schemes = database
      ? ["postgres:", "postgresql:"]
      : ["http:", "https:"];
    if (
      !schemes.includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname.toLowerCase())
    )
      throw new Error();
    // libpq query options can override the authority's host or hostaddr.
    if (url.search || url.hash) throw new Error();
    if (database) {
      if (url.pathname.length <= 1) throw new Error();
    } else if (url.username || url.password || url.pathname !== "/") {
      throw new Error();
    }
    return url.toString();
  } catch {
    // Never expose the raw URL or the native parser's credential-bearing error.
    throw new Error(`${field} must point to the supported local test stack.`);
  }
}

function checkedTargets(targets: LocalRlsTargets) {
  // CI starts Supabase on the runner itself. It has no service-host alias.
  // Check both targets before ANY client construction or subprocess starts.
  const supabaseUrl = localUrl(targets.supabaseUrl, false);
  const localDbUrl = localUrl(targets.localDbUrl, true);
  if (
    ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGHOST", "PGPORT"].some(
      (name) => process.env[name],
    )
  ) {
    throw new Error(
      "The local RLS harness refuses inherited PostgreSQL routing overrides.",
    );
  }
  if (!targets.supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is required when RUN_SUPABASE_RLS_TESTS=1.",
    );
  }
  return { supabaseUrl, localDbUrl, supabaseAnonKey: targets.supabaseAnonKey };
}

export function createLocalClient(targets: LocalRlsTargets) {
  const local = checkedTargets(targets);
  return createClient(local.supabaseUrl, local.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `lifeos-rls-w316-${Math.random().toString(16).slice(2)}`,
    },
  });
}

export async function psql(targets: LocalRlsTargets, sql: string) {
  const local = checkedTargets(targets);
  try {
    const { stdout } = await execFileAsync(
      "psql",
      [
        local.localDbUrl,
        "-X",
        "-q",
        "-t",
        "-A",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { timeout: 20_000 },
    );
    return stdout.trim();
  } catch {
    // execFile's error contains its arguments, including the DB password.
    throw new Error(
      "The local RLS SQL command failed. Check the isolated test database and psql.",
    );
  }
}

export function startLockHolder(targets: LocalRlsTargets, appName: string) {
  const local = checkedTargets(targets);
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(
      "psql",
      [local.localDbUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
      { env: { ...process.env, PGAPPNAME: appName } },
    );
  } catch {
    throw new Error("The local RLS lock holder could not start.");
  }
  const exited = new Promise<number | null>((resolve) => {
    // A native spawn error contains spawnargs (including the DB password).
    // Consume it immediately and report a failing exit, without retaining it.
    // Resolve rather than reject: the real test waits for a database lock
    // before awaiting completion, so early failure must not go unhandled.
    child.once("error", () => resolve(-1));
    child.once("close", resolve);
  });
  return { child, exited };
}

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

export function expectKnownExportCap(
  titles: string[],
  expectedTitles: string[],
  titlePrefix: string,
) {
  expect(expectedTitles.length).toBeGreaterThan(1);
  expect(new Set(expectedTitles).size).toBe(expectedTitles.length);
  expect(expectedTitles.every((title) => title.startsWith(titlePrefix))).toBe(
    true,
  );
  expect(new Set(titles).size).toBe(titles.length);
  expect(
    titles.every((title) => expectedTitles.includes(title)),
    "Export contains unseeded task data",
  ).toBe(true);
  expect(
    [expectedTitles.length - 1, expectedTitles.length],
    "Export must have exactly the capped subset or the complete fixture",
  ).toContain(titles.length);
  // Only the cap defect is inverted. Empty, foreign or duplicate exports fail above.
  expectKnownBug(() => expect(titles).toHaveLength(expectedTitles.length));
}

export type SessionFixture = {
  id: string;
  user_id: string;
  task_id: string;
  client_write_id: string;
  notes: string;
  outcome: string;
};

export type ReplayReply = {
  data: {
    deduplicated?: boolean;
    session?: Record<string, unknown>;
    task?: Record<string, unknown> | null;
    block?: unknown;
  } | null;
  error: { code?: string; message?: string } | null;
};

export function expectKnownSessionReplay(
  replies: [ReplayReply, ReplayReply],
  rows: SessionFixture[],
  expected: Omit<SessionFixture, "id">,
) {
  expect(rows).toHaveLength(1);
  const saved = rows[0]!;
  expect(typeof saved.id).toBe("string");
  expect(saved.id.length).toBeGreaterThan(0);
  expect(saved).toMatchObject(expected);

  for (const reply of replies) {
    if (reply.error !== null) {
      expect(reply.error).toMatchObject({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "execution_sessions_user_client_write_id_key"',
      });
      expect(reply.data).toBeNull();
    } else {
      expect(reply.data).not.toBeNull();
      expect(reply.data!.session).toMatchObject(saved);
      expect(reply.data!.block).toBeNull();
      expect(typeof reply.data!.deduplicated).toBe("boolean");
      if (reply.data!.deduplicated) expect(reply.data!.task).toBeNull();
      else expect(reply.data!.task?.id).toBe(expected.task_id);
    }
  }
  const successes = replies.filter((reply) => reply.error === null);
  expect([1, 2]).toContain(successes.length);
  expect(successes.map((reply) => reply.data!.deduplicated).sort()).toEqual(
    successes.length === 1 ? [false] : [false, true],
  );
  // All payload, fixture and error checks stay outside this single inverse assertion.
  expectKnownBug(() => expect(successes).toHaveLength(2));
}
