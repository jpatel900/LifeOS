// @vitest-environment node
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalClient,
  psql,
  startLockHolder,
  expectKnownExportCap,
  expectKnownSessionReplay,
  type LocalRlsTargets,
  type ReplayReply,
  type SessionFixture,
} from "@/testing/w316DatabaseHarness";

const io = vi.hoisted(() => ({
  client: vi.fn(() => ({})),
  exec: vi.fn((...args: unknown[]) => {
    const callback = args.at(-1) as (
      error: Error | null,
      output?: { stdout: string },
    ) => void;
    callback(null, { stdout: "ok\n" });
  }),
  spawn: vi.fn(() => ({})),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: io.client }));
vi.mock("node:child_process", () => ({ execFile: io.exec, spawn: io.spawn }));

const targets: LocalRlsTargets = {
  supabaseUrl: "http://127.0.0.1:15431",
  supabaseAnonKey: "synthetic-anon-key",
  localDbUrl: "postgresql://postgres:fixture-password@127.0.0.1:15433/postgres",
};
const routingVariables = [
  "PGHOSTADDR",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGHOST",
  "PGPORT",
];
const operations = [
  ["Supabase client", (config: LocalRlsTargets) => createLocalClient(config)],
  ["SQL query", (config: LocalRlsTargets) => psql(config, "select 1")],
  [
    "SQL lock holder",
    (config: LocalRlsTargets) => startLockHolder(config, "synthetic-holder"),
  ],
] as const;

describe("W7-13 local database harness boundary", () => {
  const request = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    io.spawn.mockImplementation(() => new EventEmitter());
    for (const name of routingVariables) vi.stubEnv(name, "");
    vi.stubGlobal("fetch", request);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  async function refuses(action: () => unknown) {
    let caught: unknown;
    try {
      await action();
    } catch (error) {
      caught = error;
    }
    expect(
      caught,
      "Unsafe configuration reached I/O instead of failing closed",
    ).toBeInstanceOf(Error);
    expect(String(caught)).toMatch(/local|ANON_KEY/);
    expect(String(caught)).not.toContain("fixture-password");
    expect(String(caught)).not.toContain("synthetic-anon-key");
    expect(io.client).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(io.exec).not.toHaveBeenCalled();
    expect(io.spawn).not.toHaveBeenCalled();
  }

  const invalid: Array<[string, Partial<LocalRlsTargets>]> = [
    [
      "remote API with local DB",
      { supabaseUrl: "https://shared.example.test" },
    ],
    [
      "local API with remote DB",
      {
        localDbUrl:
          "postgresql://postgres:fixture-password@shared.example.test/postgres",
      },
    ],
    [
      "both remote",
      {
        supabaseUrl: "https://shared.example.test",
        localDbUrl:
          "postgresql://user:fixture-password@remote.example.test/postgres",
      },
    ],
    [
      "loopback lookalike",
      { supabaseUrl: "http://127.0.0.1.example.test:15431" },
    ],
    [
      "API userinfo",
      { supabaseUrl: "http://fixture-password@127.0.0.1:15431" },
    ],
    ["wrong API scheme", { supabaseUrl: "file://localhost/fixture-password" }],
    ["malformed API", { supabaseUrl: "fixture-password" }],
    ["API path", { supabaseUrl: "http://localhost:15431/redirect" }],
    [
      "API query",
      {
        supabaseUrl: "http://localhost:15431?next=https://remote.example.test",
      },
    ],
    [
      "API fragment",
      { supabaseUrl: "http://localhost:15431#fixture-password" },
    ],
    ["raw whitespace", { supabaseUrl: " http://localhost:15431" }],
    ["backslash", { supabaseUrl: "http://localhost\\@remote.example.test" }],
    ["wrong DB scheme", { localDbUrl: "https://localhost/postgres" }],
    [
      "malformed DB",
      { localDbUrl: "postgresql://user:fixture-password@[bad/postgres" },
    ],
    [
      "DB multi-host",
      { localDbUrl: "postgresql://localhost,remote.example.test/postgres" },
    ],
    [
      "DB query host override",
      { localDbUrl: targets.localDbUrl + "?host=remote.example.test" },
    ],
    [
      "DB query address override",
      { localDbUrl: targets.localDbUrl + "?hostaddr=203.0.113.10" },
    ],
    [
      "DB query service override",
      { localDbUrl: targets.localDbUrl + "?service=remote" },
    ],
    ["DB fragment", { localDbUrl: targets.localDbUrl + "#fixture-password" }],
    [
      "unconfigured service hostname",
      { localDbUrl: "postgresql://postgres:fixture-password@db/postgres" },
    ],
    ["missing anonymous key", { supabaseAnonKey: undefined }],
  ];

  for (const [operation, action] of operations) {
    it.each(invalid)(
      `${operation} refuses %s before all I/O`,
      async (_name, overrides) => {
        await refuses(() => action({ ...targets, ...overrides }));
      },
    );
    it.each(routingVariables)(
      `${operation} refuses inherited %s before all I/O`,
      async (name) => {
        vi.stubEnv(name, "remote-routing-fixture");
        await refuses(() => action(targets));
      },
    );
    it.each(["127.0.0.1", "localhost"])(
      `${operation} accepts supported loopback %s`,
      async (host) => {
        await action({
          ...targets,
          supabaseUrl: `http://${host}:15431`,
          localDbUrl: `postgresql://postgres:fixture-password@${host}:15433/postgres`,
        });
        expect(
          io.client.mock.calls.length +
            io.exec.mock.calls.length +
            io.spawn.mock.calls.length,
        ).toBe(1);
        expect(request).not.toHaveBeenCalled();
      },
    );
  }
  describe("W7-13 subprocess failure redaction", () => {
    const nativeError = () =>
      Object.assign(new Error(`spawn failed: ${targets.localDbUrl}`), {
        spawnargs: [targets.localDbUrl],
      });
    it("sanitizes the SQL exec failure", async () => {
      io.exec.mockImplementationOnce((...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error) => void;
        callback(nativeError());
      });
      let caught: unknown;
      try {
        await psql(targets, "select 1");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "The local RLS SQL command failed. Check the isolated test database and psql.",
      );
      expect((caught as Error).cause).toBeUndefined();
      expect(String(caught)).not.toContain("fixture-password");
    });
    it("sanitizes a synchronous holder launch failure", () => {
      io.spawn.mockImplementationOnce(() => {
        throw nativeError();
      });
      let caught: unknown;
      try {
        startLockHolder(targets, "synthetic-holder");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(
        "The local RLS lock holder could not start.",
      );
      expect((caught as Error).cause).toBeUndefined();
    });
    it("handles an asynchronous holder error without exposing native details", async () => {
      const child = new EventEmitter();
      io.spawn.mockReturnValueOnce(child);
      const holder = startLockHolder(targets, "synthetic-holder");
      expect(() => child.emit("error", nativeError())).not.toThrow();
      expect(await holder.exited).toBe(-1);
    });
    it("preserves an ordinary holder exit code", async () => {
      const child = new EventEmitter();
      io.spawn.mockReturnValueOnce(child);
      const holder = startLockHolder(targets, "synthetic-holder");
      child.emit("close", 7);
      expect(await holder.exited).toBe(7);
    });
  });
});

function rejectsAsHarnessFailure(check: () => void) {
  let caught: unknown;
  try {
    check();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).not.toContain("KNOWN BUG fixed");
}

describe("W7-13 export expected-failure precision", () => {
  const seeded = ["fixture-0", "fixture-1", "fixture-2"];
  const check = (titles: string[]) =>
    expectKnownExportCap(titles, seeded, "fixture-");
  it.each([
    ["fixture-0", "fixture-1"],
    ["fixture-2", "fixture-0"],
  ])("accepts only the genuine cap shape %j", (...titles) => {
    expect(() => check(titles)).not.toThrow();
  });
  it.each([
    ["empty", []],
    ["less than cap", ["fixture-0"]],
    ["duplicate", ["fixture-0", "fixture-0"]],
    ["unseeded title", ["fixture-0", "fixture-99"]],
    ["foreign title", ["fixture-0", "other-user-row"]],
    ["extra row", [...seeded, "fixture-99"]],
  ] as Array<[string, string[]]>)(
    "rejects %s outside the inverse assertion",
    (_name, titles) => {
      rejectsAsHarnessFailure(() => check(titles));
    },
  );
  it("requires marker removal when all seeded rows are exported", () => {
    expect(() => check([...seeded].reverse())).toThrow(/KNOWN BUG fixed/);
  });
});

describe("W7-13 session replay expected-failure precision", () => {
  const row: SessionFixture = {
    id: "session-fixture",
    user_id: "user-fixture",
    task_id: "task-fixture",
    client_write_id: "write-fixture",
    notes: "synthetic-notes",
    outcome: "partial",
  };
  const expected = {
    user_id: row.user_id,
    task_id: row.task_id,
    client_write_id: row.client_write_id,
    notes: row.notes,
    outcome: row.outcome,
  };
  const success = (deduplicated = false): ReplayReply => ({
    error: null,
    data: {
      session: { ...row },
      block: null,
      task: deduplicated ? null : { id: row.task_id },
      deduplicated,
    },
  });
  const duplicate = (): ReplayReply => ({
    data: null,
    error: {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "execution_sessions_user_client_write_id_key"',
    },
  });
  const check = (replies: [ReplayReply, ReplayReply], rows = [row]) =>
    expectKnownSessionReplay(replies, rows, expected);

  it("accepts the exact unique-index failure after a valid creation", () => {
    expect(() => check([success(), duplicate()])).not.toThrow();
    expect(() => check([duplicate(), success()])).not.toThrow();
  });
  it.each([
    [
      "transport failure",
      { code: "PGRST000", message: "synthetic transport failure" },
    ],
    ["wrong SQLSTATE", { code: "40001", message: duplicate().error!.message }],
    [
      "different index",
      {
        code: "23505",
        message: 'duplicate key value violates unique constraint "another_key"',
      },
    ],
  ] as Array<[string, NonNullable<ReplayReply["error"]>]>)(
    "rejects %s as a normal harness failure",
    (_name, error) => {
      rejectsAsHarnessFailure(() => check([success(), { data: null, error }]));
    },
  );
  it("rejects two failed callers", () =>
    rejectsAsHarnessFailure(() => check([duplicate(), duplicate()])));
  it("rejects an error with a success payload", () =>
    rejectsAsHarnessFailure(() =>
      check([success(), { ...duplicate(), data: success().data }]),
    ));
  it("rejects missing success data", () =>
    rejectsAsHarnessFailure(() =>
      check([{ error: null, data: null }, duplicate()]),
    ));
  it("rejects a replay instead of the creating success", () =>
    rejectsAsHarnessFailure(() => check([success(true), duplicate()])));
  it.each(["id", "user_id", "task_id", "client_write_id", "notes", "outcome"])(
    "rejects successful session with wrong %s",
    (field) => {
      const response = success();
      response.data!.session![field] = "wrong-fixture";
      rejectsAsHarnessFailure(() => check([response, duplicate()]));
    },
  );
  it.each([
    "user_id",
    "task_id",
    "client_write_id",
    "notes",
    "outcome",
  ] as const)("rejects persisted row with wrong %s", (field) => {
    rejectsAsHarnessFailure(() =>
      check([success(), duplicate()], [{ ...row, [field]: "wrong-fixture" }]),
    );
  });
  it("rejects wrong created task", () => {
    const response = success();
    response.data!.task = { id: "wrong-fixture" };
    rejectsAsHarnessFailure(() => check([response, duplicate()]));
  });
  it("rejects an unexpected block", () => {
    const response = success();
    response.data!.block = { id: "unexpected-fixture" };
    rejectsAsHarnessFailure(() => check([response, duplicate()]));
  });
  it("rejects a missing or duplicated persisted session", () => {
    rejectsAsHarnessFailure(() => check([success(), duplicate()], []));
    rejectsAsHarnessFailure(() => check([success(), duplicate()], [row, row]));
  });
  it("rejects two creation acknowledgements", () =>
    rejectsAsHarnessFailure(() => check([success(), success()])));
  it("requires marker removal once both callers return the same saved session", () => {
    expect(() => check([success(), success(true)])).toThrow(/KNOWN BUG fixed/);
    expect(() => check([success(true), success()])).toThrow(/KNOWN BUG fixed/);
  });
});
