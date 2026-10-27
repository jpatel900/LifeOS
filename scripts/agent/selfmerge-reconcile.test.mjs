import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("only the reconciler owns auto-merge mutations", () => {
  for (const file of [
    ".github/workflows/safe-automerge.yml",
    "scripts/agent/red-guard-diagnose.mjs",
  ]) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /enablePullRequestAutoMerge|disablePullRequestAutoMerge|["']--auto["']|["']--disable-auto["']/,
    );
  }
});

test("importing the writer never executes the CLI", () => {
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "await import('./scripts/agent/selfmerge-window.mjs')",
    ],
    { stdio: "pipe" },
  );
});

const context = {
  number: 42,
  id: "PR_test",
  state: "OPEN",
  headRef: "fix/example",
  headSha: "head",
  baseSha: "base",
  labels: ["automerge:safe", "risk:low"],
  title: "docs: example",
  body: "Ready",
  draft: false,
  changedPaths: ["docs/example.md"],
  diffStats: [{ path: "docs/example.md", added: 2, deleted: 0, status: "M" }],
  reviewDecision: "",
  mergeStateStatus: "CLEAN",
  notifiedHeadSha: "head",
  notifiedAtIso: "2026-10-01T00:00:00.000Z",
};
const health = { mainHealthy: true, guardRevertOpen: false };
const verdict = {
  number: 42,
  headSha: "head",
  baseSha: "base",
  eligible: true,
};
const api = () => import("./selfmerge-window.mjs");

test("an ordinary PR never receives a self-merge notification", async () => {
  const { evaluateAutoMerge } = await api();
  assert.equal(
    evaluateAutoMerge(
      { ...context, labels: [], notifiedHeadSha: null, notifiedAtIso: null },
      health,
    ).renotify,
    false,
  );
});

test("enabling binds the approved head and refuses absent head identity", async () => {
  const { writeAutoMerge } = await api();
  let sent;
  writeAutoMerge(
    { id: "PR_test", enabled: true, headSha: "head" },
    {
      graphql: (query, id, head) => {
        sent = { query, id, head };
        return {};
      },
    },
  );
  assert.match(sent.query, /expectedHeadOid/);
  assert.equal(sent.head, "head");
  assert.throws(
    () =>
      writeAutoMerge({ id: "PR_test", enabled: true }, { graphql: () => ({}) }),
    /head/i,
  );
});

test("already-green self-merge and recovery keep the existing CLI completion behavior", async () => {
  const { writeAutoMerge } = await api();
  let command;
  const result = writeAutoMerge(
    {
      id: "PR_test",
      enabled: true,
      mergeWhenReady: true,
      repo: "owner/repo",
      number: 42,
      headSha: "head",
    },
    {
      graphql: () => {
        throw new Error("An already-clean CLI route must retain CLI behavior");
      },
      execute: (args) => {
        command = args;
      },
    },
  );
  assert.equal(result.action, "armed-or-merged");
  assert.deepEqual(command, [
    "pr",
    "merge",
    "42",
    "--repo",
    "owner/repo",
    "--squash",
    "--auto",
    "--match-head-commit",
    "head",
  ]);
});

test("mutation workflows share a lock and execute trusted main code", () => {
  for (const file of [
    "safe-automerge.yml",
    "selfmerge-window.yml",
    "main-red-guard.yml",
  ]) {
    const yaml = readFileSync(`.github/workflows/${file}`, "utf8");
    assert.match(yaml, /group: pr-automerge-/);
    assert.match(yaml, /queue: max/);
    assert.match(yaml, /ref: main/);
  }
  const safe = readFileSync(".github/workflows/safe-automerge.yml", "utf8");
  assert.match(safe, /if: always\(\)/);
  assert.match(safe, /SAFE_VERDICT:/);
  assert.match(safe, /check-safe-automerge\.mjs/);
  assert.doesNotMatch(safe, /ref: refs\/pull/);
  assert.match(
    readFileSync(".github/workflows/selfmerge-window.yml", "utf8"),
    /fail-fast: false/,
  );
});

test("conflicting route verdicts preserve either independently eligible class", async () => {
  const { evaluateAutoMerge } = await api();
  assert.equal(evaluateAutoMerge(context, health).enabled, true);
  const app = {
    ...context,
    labels: ["selfmerge:auto", "risk:low"],
    changedPaths: ["apps/web/src/app/page.tsx"],
    diffStats: [],
  };
  assert.equal(
    evaluateAutoMerge(app, health, { ...verdict, eligible: false }).enabled,
    true,
  );
  const tests = {
    ...context,
    labels: ["automerge:tests-additive", "risk:low"],
    changedPaths: ["apps/web/src/a.test.ts"],
    diffStats: [
      { path: "apps/web/src/a.test.ts", added: 2, deleted: 0, status: "A" },
    ],
  };
  assert.equal(evaluateAutoMerge(tests, health).enabled, true);
  assert.equal(
    evaluateAutoMerge(
      { ...tests, diffStats: [{ ...tests.diffStats[0], deleted: 1 }] },
      health,
    ).enabled,
    false,
  );
});

test("removed labels, draft, owner gate, and failed or stale handoff revoke", async () => {
  const { evaluateAutoMerge } = await api();
  for (const update of [
    { labels: ["risk:low"] },
    { draft: true },
    { body: "- [ ] OWNER-GATE: approval" },
    { body: null },
    { state: "CLOSED" },
  ]) {
    assert.equal(
      evaluateAutoMerge({ ...context, ...update }, health, verdict).enabled,
      false,
    );
  }
  for (const bad of [
    null,
    {},
    { ...verdict, headSha: "old" },
    { ...verdict, baseSha: "old" },
    { ...verdict, number: 99 },
    { ...verdict, eligible: "true" },
  ]) {
    assert.equal(evaluateAutoMerge(context, health, bad).enabled, false);
  }
});

test("CI completion re-evaluates both lanes and keeps main-health gate route-specific", async () => {
  const { evaluateAutoMerge } = await api();
  assert.equal(
    evaluateAutoMerge(context, { ...health, mainHealthy: false }).enabled,
    true,
  );
  const self = { ...context, labels: ["selfmerge:auto", "risk:low"] };
  assert.equal(
    evaluateAutoMerge(self, { ...health, mainHealthy: false }).enabled,
    false,
  );
  assert.equal(evaluateAutoMerge(self, health).enabled, true);
  assert.equal(
    evaluateAutoMerge({ ...self, notifiedHeadSha: "old" }, health).enabled,
    false,
  );
  assert.equal(
    evaluateAutoMerge({ ...self, reviewDecision: "CHANGES_REQUESTED" }, health)
      .enabled,
    false,
  );
});

test("confirmed recovery stays separate but owner gate, draft and stand-down win", async () => {
  const { evaluateAutoMerge } = await api();
  const guard = {
    ...context,
    headRef: "guard/revert-main-example",
    labels: ["revert:confirm"],
    changedPaths: [".github/workflows/ci.yml"],
  };
  assert.equal(
    evaluateAutoMerge(guard, { mainHealthy: false, guardRevertOpen: true })
      .enabled,
    true,
  );
  for (const update of [
    { labels: [] },
    { labels: ["revert:confirm", "revert:wont-fix"] },
    { draft: true },
    { body: "OWNER RATIFICATION REQUIRED" },
  ]) {
    assert.equal(
      evaluateAutoMerge({ ...guard, ...update }, health).enabled,
      false,
    );
  }
});

test("ambiguous disable needs strict fresh confirmation, never a stale payload", async () => {
  const { writeAutoMerge } = await api();
  for (const node of [
    null,
    { __typename: "Issue", autoMergeRequest: null },
    { __typename: "PullRequest" },
    { __typename: "PullRequest", autoMergeRequest: {} },
  ]) {
    const calls = [];
    assert.throws(
      () =>
        writeAutoMerge(
          { id: "PR_test", enabled: false },
          {
            graphql: (query) => {
              calls.push(query);
              if (calls.length === 1) throw new Error("ambiguous");
              return { node };
            },
          },
        ),
      /confirm/i,
    );
    assert.equal(calls.length, 2);
  }
  let count = 0;
  assert.equal(
    writeAutoMerge(
      { id: "PR_test", enabled: false },
      {
        graphql: () => {
          if (++count === 1) throw new Error("ambiguous");
          return {
            node: { __typename: "PullRequest", autoMergeRequest: null },
          };
        },
      },
    ).action,
    "not-enabled",
  );
  assert.throws(
    () =>
      writeAutoMerge(
        { id: "PR_test", enabled: false },
        {
          graphql: () => {
            throw new Error("offline");
          },
        },
      ),
    /confirm/i,
  );
});

test("the writer enables only auto-merge, uses squash, and propagates enable failures", async () => {
  const { writeAutoMerge } = await api();
  let sent;
  assert.equal(
    writeAutoMerge(
      { id: "PR_test", enabled: true, headSha: "head" },
      {
        graphql: (query, id) => {
          sent = { query, id };
          return {};
        },
      },
    ).action,
    "enabled",
  );
  assert.match(sent.query, /enablePullRequestAutoMerge/);
  assert.match(sent.query, /SQUASH/);
  assert.equal(sent.id, "PR_test");
  assert.throws(
    () =>
      writeAutoMerge(
        { id: "PR_test", enabled: true, headSha: "head" },
        {
          graphql: () => {
            throw new Error("denied");
          },
        },
      ),
    /denied/,
  );
});

test("fresh reads refuse incomplete files or a head changed during collection", async () => {
  const { collectPr } = await api();
  const pr = {
    number: 42,
    id: "PR_test",
    state: "OPEN",
    headRefName: "fix/example",
    headRefOid: "head",
    baseRefOid: "base",
    labels: [],
    isDraft: false,
    title: "test",
    body: "",
    comments: [],
    changedFiles: 1,
  };
  const files = [
    [
      {
        filename: "apps/web/src/a.test.ts",
        status: "added",
        additions: 1,
        deletions: 0,
        patch: "+test",
      },
    ],
  ];
  const read = (sequence) => () => sequence.shift();
  assert.throws(
    () => collectPr(42, { repo: "owner/repo", read: read([pr, [[]], pr]) }),
    /complete/i,
  );
  assert.throws(
    () =>
      collectPr(42, {
        repo: "owner/repo",
        read: read([pr, files, { ...pr, headRefOid: "new" }]),
      }),
    /changed/i,
  );
  const valid = collectPr(42, {
    repo: "owner/repo",
    read: read([pr, files, pr]),
  });
  assert.deepEqual(valid.diffStats, [
    { path: "apps/web/src/a.test.ts", status: "A", added: 1, deleted: 0 },
  ]);
  assert.equal(valid.body, "");
  const binary = [[{ ...files[0][0], patch: undefined }]];
  assert.equal(
    collectPr(42, { repo: "owner/repo", read: read([pr, binary, pr]) })
      .diffStats[0].added,
    null,
  );
});

// Run the real entry points with every subprocess replaced before importing the
// script. Unexpected commands fail. No network, credentials or GitHub writes.
function mockCli(script, args, update = {}, options = {}) {
  const pr = {
    id: "PR_test",
    number: 42,
    state: "OPEN",
    headRefName: "fix/example",
    headRefOid: "head",
    baseRefOid: "base",
    labels: [{ name: "automerge:safe" }, { name: "risk:low" }],
    isDraft: false,
    title: "docs",
    body: "",
    changedFiles: 1,
    comments: [],
    autoMergeRequest: { enabledAt: "now" },
    ...update,
  };
  const code = `
    import child from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { resolve } from 'node:path';
    import { pathToFileURL } from 'node:url';
    const pr = ${JSON.stringify(pr)};
    const options = ${JSON.stringify(options)};
    const calls = [];
    child.execFileSync = (command, argv) => {
      if (command !== 'gh') throw new Error('Unexpected subprocess: ' + command);
      calls.push(argv);
      if (argv[0] === 'pr' && argv[1] === 'view') return JSON.stringify(pr);
      if (argv[0] === 'pr' && argv[1] === 'merge' && argv.includes('--auto') && argv.includes('--match-head-commit')) return '';
      if (argv[0] === 'api' && argv.includes('--paginate')) {
        if (options.filesFail) throw new Error('files unavailable');
        return JSON.stringify([[{filename: 'docs/example.md', status: 'modified', additions: 1, deletions: 0, patch: '+doc'}]]);
      }
      if (argv[0] === 'api' && argv[1] === 'graphql') return JSON.stringify({data: {}});
      if (argv[0] === 'api' && argv[1].includes('/jobs?')) return JSON.stringify({jobs: [{name: 'unit', conclusion: 'failure'}]});
      if (argv[0] === 'run' && argv[1] === 'list') return JSON.stringify([{status: 'completed', conclusion: 'success'}]);
      if (argv[0] === 'pr' && argv[1] === 'list') return '[]';
      if (argv[0] === 'pr' && argv[1] === 'comment') {
        pr.comments.push({ body: argv[argv.indexOf('--body') + 1] });
        return '';
      }
      if (argv[0] === 'pr' && argv[1] === 'edit') return '';
      if (argv[0] === 'label' && argv[1] === 'create') return '';
      throw new Error('Unexpected gh call: ' + JSON.stringify(argv));
    };
    syncBuiltinESMExports();
    process.env.GH_REPO = 'owner/repo';
    process.env.PR_NUMBER = '42';
    delete process.env.GITHUB_OUTPUT;
    delete process.env.GITHUB_STEP_SUMMARY;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SAFE_VERDICT;
    if (options.handoff !== undefined) process.env.SAFE_VERDICT = options.handoff;
    process.argv = [process.execPath, resolve(${JSON.stringify(script)}), ...${JSON.stringify(args)}];
    process.on('exit', () => console.log('MOCK_CALLS=' + JSON.stringify(calls)));
    await import(pathToFileURL(process.argv[1]));
  `;
  let output,
    status = 0;
  try {
    output = execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", code],
      { encoding: "utf8", stdio: "pipe", timeout: 10000 },
    );
  } catch (error) {
    output = String(error.stdout);
    status = error.status;
  }
  const line = output
    .split(/\r?\n/)
    .find((value) => value.startsWith("MOCK_CALLS="));
  assert.ok(line, output);
  return { status, calls: JSON.parse(line.slice("MOCK_CALLS=".length)) };
}

test("the actual safe handoff arms or revokes, including failed evaluator and API reads", () => {
  const good = mockCli(
    "scripts/agent/selfmerge-window.mjs",
    ["--notify"],
    {},
    { handoff: JSON.stringify(verdict) },
  );
  assert.equal(good.status, 0);
  assert.ok(
    good.calls.some((args) =>
      args.some((arg) => arg.includes("enablePullRequestAutoMerge")),
    ),
  );
  for (const options of [
    { handoff: "" },
    { handoff: "{broken" },
    { filesFail: true },
  ]) {
    const result = mockCli(
      "scripts/agent/selfmerge-window.mjs",
      ["--reconcile"],
      {},
      options,
    );
    assert.equal(result.status, options.filesFail ? 1 : 0);
    assert.ok(
      result.calls.some((args) =>
        args.some((arg) => arg.includes("disablePullRequestAutoMerge")),
      ),
    );
    assert.ok(
      !result.calls.some((args) =>
        args.some((arg) => arg.includes("enablePullRequestAutoMerge")),
      ),
    );
  }
});

test("the CLI notifies only an opted-in PR, then uses the fresh notification", () => {
  const ordinary = mockCli(
    "scripts/agent/selfmerge-window.mjs",
    ["--reconcile"],
    { labels: [] },
  );
  assert.equal(ordinary.status, 0);
  assert.ok(!ordinary.calls.some((args) => args[1] === "comment"));
  const opted = mockCli("scripts/agent/selfmerge-window.mjs", ["--reconcile"], {
    labels: [{ name: "selfmerge:auto" }, { name: "risk:low" }],
  });
  assert.equal(opted.status, 0);
  assert.equal(opted.calls.filter((args) => args[1] === "comment").length, 1);
  assert.ok(
    opted.calls.some((args) => args[1] === "merge" && args.includes("--auto")),
  );
});

test("red-guard CLI lazy import completes and preserves confirmation and stand-down ordering", () => {
  const guard = {
    headRefName: "guard/revert-main-test",
    labels: [{ name: "revert:confirm" }],
  };
  const confirmed = mockCli(
    "scripts/agent/red-guard-diagnose.mjs",
    ["--confirm-arm", "--repo", "owner/repo", "--pr", "42"],
    guard,
  );
  assert.equal(confirmed.status, 0);
  assert.ok(
    confirmed.calls.some(
      (args) =>
        args.includes("--auto") &&
        args.includes("--match-head-commit") &&
        args.includes("head"),
    ),
  );
  const blocked = mockCli(
    "scripts/agent/red-guard-diagnose.mjs",
    ["--confirm-arm", "--repo", "owner/repo", "--pr", "42"],
    { ...guard, body: null },
  );
  assert.equal(blocked.status, 0);
  assert.ok(
    blocked.calls.some((args) =>
      args.some((arg) => arg.includes("disablePullRequestAutoMerge")),
    ),
  );
  const stoodDown = mockCli(
    "scripts/agent/red-guard-diagnose.mjs",
    [
      "--stand-down",
      "--repo",
      "owner/repo",
      "--pr",
      "42",
      "--revert-run-id",
      "101",
    ],
    {
      ...guard,
      comments: [
        {
          body: '<!-- red-guard-diagnosis: {"failedRunId":"100","failedJobNames":["unit"],"verdict":"change"} -->',
        },
      ],
    },
  );
  assert.equal(stoodDown.status, 0);
  const label = stoodDown.calls.findIndex((args) =>
    args.includes("--add-label"),
  );
  const disable = stoodDown.calls.findIndex((args) =>
    args.some((arg) => arg.includes("disablePullRequestAutoMerge")),
  );
  const comment = stoodDown.calls.findIndex((args) => args[1] === "comment");
  assert.ok(label >= 0 && disable > label && comment > disable);
});
