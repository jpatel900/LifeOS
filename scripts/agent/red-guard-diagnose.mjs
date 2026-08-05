#!/usr/bin/env node

// Main Red Guard companion (owner decision 2026-08-05: notify and hold +
// automatic stand-down + a diagnosis step).
//
// The guard no longer arms auto-merge on its revert PRs. Instead:
//   --diagnose     read every attempt of the failed main run, extract the
//                  failing spec lines and error signatures, classify in
//                  plain language, post it on the revert PR, and send a
//                  1-2 line Telegram notice. NEVER blocks the PR: any
//                  failure degrades to "diagnosis unavailable: <reason>".
//   --confirm-arm  a human added `revert:confirm`: arm auto-merge, unless
//                  `revert:wont-fix` is present (then explain the conflict).
//   --stand-down   the revert PR's own CI finished: if a job with the SAME
//                  NAME as one that made main red also failed here, the
//                  revert does not fix main — label `revert:wont-fix`,
//                  comment, and disarm auto-merge if it was armed.
//
// Every decision is a pure function so `--self-test` can pin it. The fixtures
// are the two real signatures from 2026-08-05 (PR #841): main failed the same
// new spec two different ways (deep equality, then a click timeout) while the
// revert PR failed a different spec with PGRST303.
//
// Dependency-free by design, like the other scripts/agent policy scripts, so
// the CI self-test job never has to install anything.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

export const CONFIRM_LABEL = "revert:confirm";
export const WONT_FIX_LABEL = "revert:wont-fix";
export const MARKER_PREFIX = "<!-- red-guard-diagnosis:";

const HELD_LINE = `This revert is HELD — nothing merges until a human adds the \`${CONFIRM_LABEL}\` label. Close this PR to cancel the revert.`;

// ---------------------------------------------------------------------------
// Pure: log reading
// ---------------------------------------------------------------------------

// Playwright prints failing specs with a ✘ marker; the reporter summary and
// the error block both carry the `<file>.spec.ts:<line>` coordinate.
const SPEC_RE = /([\w./@-]+\.spec\.[tj]sx?):(\d+)(?::(\d+))?/g;

const SIGNATURE_RULES = [
  { kind: "postgrest", re: /\bPGRST\d{3}\b/ },
  { kind: "timeout", re: /\b(Timeout|TimeoutError|timed out|timeout of)\b/i },
  {
    kind: "deep-equality",
    re: /toEqual|toStrictEqual|deep equality|Expected: |Received: /,
  },
  { kind: "assertion", re: /\bexpect\(/ },
  { kind: "error", re: /^\s*Error:/ },
];

/**
 * Pull the human-meaningful failure evidence out of one job's raw log text.
 * Returns the ✘ lines verbatim (quoted back to humans in the comment), the
 * set of failing spec coordinates, and the coarse error mechanisms seen.
 */
export function extractSignals(logText) {
  const lines = String(logText ?? "").split(/\r?\n/);
  const failureLines = [];
  const specs = new Set();
  const signatures = new Set();

  for (const raw of lines) {
    // Strip the GitHub Actions timestamp prefix so quoted lines read cleanly.
    const line = raw.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, "").trimEnd();
    if (!line.trim()) continue;

    const isFailureLine = line.includes("✘");
    const matchedRules = SIGNATURE_RULES.filter((rule) => rule.re.test(line));

    if (isFailureLine || matchedRules.length > 0) {
      SPEC_RE.lastIndex = 0;
      let match;
      while ((match = SPEC_RE.exec(line)) !== null) {
        specs.add(`${match[1]}:${match[2]}`);
      }
    }

    if (isFailureLine) failureLines.push(line.trim());
    for (const rule of matchedRules) signatures.add(rule.kind);
  }

  return {
    failureLines: failureLines.slice(0, 12),
    specs: [...specs].sort(),
    signatures: [...signatures].sort(),
  };
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function intersect(lists) {
  return lists.reduce((acc, list) => acc.filter((v) => list.includes(v)));
}

// ---------------------------------------------------------------------------
// Pure: classification
// ---------------------------------------------------------------------------

export const VERDICTS = {
  CHANGE_SUSPECT: "change-suspect",
  NONDETERMINISTIC: "nondeterministic",
  ENVIRONMENT: "environment",
  INCONCLUSIVE: "inconclusive",
};

const VERDICT_TEXT = {
  [VERDICTS.CHANGE_SUSPECT]:
    "The same test failed the same way on every attempt. The change or a real race is suspect — read the failure before reverting.",
  [VERDICTS.NONDETERMINISTIC]:
    "The same test failed in different ways on different attempts. That points to a flaky test or a race, not a clean break — a revert probably will not fix this.",
  [VERDICTS.ENVIRONMENT]:
    "Different tests failed on different attempts. The environment or a flaky test tier is suspect — a revert probably will not fix this.",
  [VERDICTS.INCONCLUSIVE]:
    "There is not enough readable evidence to compare attempts. Read the run before deciding.",
};

/**
 * Classify a red main run from its per-attempt signals.
 *
 * attempts: [{ attempt, logsAvailable, jobNames, specs, signatures, reason }]
 *
 * Deliberately refuses to classify from a single readable attempt: a
 * confident wrong verdict is worse than "cannot compare".
 */
export function classifyAttempts(attempts) {
  const list = Array.isArray(attempts) ? attempts : [];
  const usable = list.filter(
    (a) => a.logsAvailable && (a.specs?.length || a.signatures?.length),
  );

  if (usable.length === 0) {
    const reason =
      list.find((a) => a.reason)?.reason ??
      "no failing-job logs could be read for any attempt";
    return {
      verdict: VERDICTS.INCONCLUSIVE,
      headline: VERDICT_TEXT[VERDICTS.INCONCLUSIVE],
      detail: `diagnosis unavailable: ${reason}`,
      comparedAttempts: 0,
    };
  }

  if (usable.length === 1) {
    return {
      verdict: VERDICTS.INCONCLUSIVE,
      headline: VERDICT_TEXT[VERDICTS.INCONCLUSIVE],
      detail:
        "Only one attempt's logs could be read, so nothing can be compared across attempts. Do not read this as a repeatable failure.",
      comparedAttempts: 1,
    };
  }

  const specLists = usable.map((a) => [...(a.specs ?? [])].sort());
  const shared = intersect(specLists);
  const identicalSpecs =
    shared.length > 0 && specLists.every((list) => sameSet(list, shared));

  if (!identicalSpecs) {
    return {
      verdict: VERDICTS.ENVIRONMENT,
      headline: VERDICT_TEXT[VERDICTS.ENVIRONMENT],
      detail: shared.length
        ? "The attempts only partly overlap, so at least one failure is not explained by the change."
        : "No test failed on more than one attempt.",
      comparedAttempts: usable.length,
    };
  }

  const signatureLists = usable.map((a) => [...(a.signatures ?? [])].sort());
  const identicalSignatures = signatureLists.every((list) =>
    sameSet(list, signatureLists[0]),
  );

  if (identicalSignatures) {
    return {
      verdict: VERDICTS.CHANGE_SUSPECT,
      headline: VERDICT_TEXT[VERDICTS.CHANGE_SUSPECT],
      detail: `Every attempt failed \`${shared.join(", ")}\` with the same kind of error (${signatureLists[0].join(", ") || "unclassified"}).`,
      comparedAttempts: usable.length,
    };
  }

  return {
    verdict: VERDICTS.NONDETERMINISTIC,
    headline: VERDICT_TEXT[VERDICTS.NONDETERMINISTIC],
    detail: `\`${shared.join(", ")}\` failed on every attempt, but the error changed: ${signatureLists
      .map(
        (list, index) =>
          `attempt ${usable[index].attempt} = ${list.join(", ") || "unclassified"}`,
      )
      .join("; ")}.`,
    comparedAttempts: usable.length,
  };
}

// ---------------------------------------------------------------------------
// Pure: rendering
// ---------------------------------------------------------------------------

export function renderMarker(payload) {
  return `${MARKER_PREFIX} ${JSON.stringify(payload)} -->`;
}

export function parseMarker(comments) {
  const list = Array.isArray(comments) ? comments : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const body = list[index]?.body ?? "";
    const start = body.indexOf(MARKER_PREFIX);
    if (start === -1) continue;
    const end = body.indexOf("-->", start);
    if (end === -1) continue;
    try {
      const payload = JSON.parse(
        body.slice(start + MARKER_PREFIX.length, end).trim(),
      );
      if (payload && payload.failedRunId) return payload;
    } catch {
      // Malformed marker: keep looking at older comments.
    }
  }
  return null;
}

export function renderDiagnosisComment({
  classification,
  attempts,
  runUrl,
  marker,
}) {
  const lines = [marker, "", "## What went wrong on main", ""];
  lines.push(classification.headline, "", classification.detail, "");

  const readable = (attempts ?? []).filter((a) => a.logsAvailable);
  if (readable.length > 0) {
    lines.push("### What failed, attempt by attempt", "");
    for (const attempt of readable) {
      const jobs = attempt.jobNames?.length
        ? attempt.jobNames.join(", ")
        : "unknown job";
      lines.push(`**Attempt ${attempt.attempt}** — failing job: ${jobs}`);
      if (attempt.failureLines?.length) {
        lines.push("", "```", ...attempt.failureLines, "```", "");
      } else {
        lines.push("", "_No `✘` lines were found in this attempt's log._", "");
      }
    }
  }

  const unreadable = (attempts ?? []).filter((a) => !a.logsAvailable);
  for (const attempt of unreadable) {
    lines.push(
      `**Attempt ${attempt.attempt}** — diagnosis unavailable: ${attempt.reason ?? "logs could not be read"}.`,
      "",
    );
  }

  lines.push("---", "", HELD_LINE);
  if (runUrl) lines.push("", `Failed run: ${runUrl}`);
  return lines.join("\n");
}

export function renderTelegramNotice({ prNumber, prUrl, classification }) {
  return [
    `LifeOS main is red — revert PR #${prNumber} is HELD (nothing merges until someone adds \`${CONFIRM_LABEL}\`).`,
    `${classification.headline} ${prUrl ?? ""}`.trim(),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pure: confirm-to-arm and stand-down decisions
// ---------------------------------------------------------------------------

export function evaluateConfirmArm({ labels, state, headRef }) {
  const names = Array.isArray(labels) ? labels : [];
  if (state && state.toUpperCase() !== "OPEN") {
    return { arm: false, comment: null, reason: "PR is not open." };
  }
  if (headRef && !headRef.startsWith("guard/revert-main-")) {
    return {
      arm: false,
      comment: null,
      reason: "Not a Main Red Guard revert PR.",
    };
  }
  if (!names.includes(CONFIRM_LABEL)) {
    return {
      arm: false,
      comment: null,
      reason: `\`${CONFIRM_LABEL}\` is not present.`,
    };
  }
  if (names.includes(WONT_FIX_LABEL)) {
    return {
      arm: false,
      comment: `Not arming auto-merge: this PR carries both \`${CONFIRM_LABEL}\` and \`${WONT_FIX_LABEL}\`.\n\n\`${WONT_FIX_LABEL}\` means the revert's own CI showed the same job still failing without the reverted commits — merging it would not restore green. Remove \`${WONT_FIX_LABEL}\` if you disagree with that finding, then re-add \`${CONFIRM_LABEL}\`.`,
      reason: "Conflicting labels.",
    };
  }
  return {
    arm: true,
    comment: `Auto-merge armed: a human added \`${CONFIRM_LABEL}\`. This revert now merges on its own once its checks pass.`,
    reason: "Confirmed by a human.",
  };
}

export function evaluateStandDown({
  mainFailedJobNames,
  revertFailedJobNames,
  autoMergeArmed,
}) {
  const main = Array.isArray(mainFailedJobNames) ? mainFailedJobNames : [];
  const revert = Array.isArray(revertFailedJobNames)
    ? revertFailedJobNames
    : [];
  const overlap = main.filter((name) => revert.includes(name));

  if (main.length === 0) {
    return {
      standDown: false,
      disarm: false,
      overlap: [],
      comment: null,
      reason:
        "The job names that made main red are unknown, so no comparison is possible.",
    };
  }
  if (overlap.length === 0) {
    return {
      standDown: false,
      disarm: false,
      overlap: [],
      comment: null,
      reason:
        "No job that made main red also failed on this revert — the revert may still fix main.",
    };
  }

  const jobList = overlap.map((name) => `\`${name}\``).join(", ");
  const commentLines = [
    "## This revert does not fix main",
    "",
    `The same job fails here too, on a tree that does **not** contain the reverted commits: ${jobList}.`,
    "",
    "Reverting cannot restore green when the failure survives the revert. A forward fix is indicated — read the failure and repair it on main.",
    "",
    `Labelled \`${WONT_FIX_LABEL}\`.`,
  ];
  if (autoMergeArmed) {
    commentLines.push(
      "",
      "Auto-merge was already armed by a human confirmation; it has been **disarmed**.",
    );
  }

  return {
    standDown: true,
    disarm: Boolean(autoMergeArmed),
    overlap,
    comment: commentLines.join("\n"),
    reason: `Same job(s) failed on the revert: ${overlap.join(", ")}.`,
  };
}

// ---------------------------------------------------------------------------
// Side-effecting helpers (never reached by the self-test)
// ---------------------------------------------------------------------------

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function repoSlug(argv) {
  return (
    argv.repo ||
    process.env.GITHUB_REPOSITORY ||
    (() => {
      throw new Error("--repo or GITHUB_REPOSITORY is required.");
    })()
  );
}

function failedJobsForRun(repo, runId, attempt) {
  const path =
    attempt === undefined
      ? `/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`
      : `/repos/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`;
  const payload = ghJson(["api", path]);
  return (payload.jobs ?? []).filter((job) => job.conclusion === "failure");
}

function collectAttempts(repo, runId) {
  const run = ghJson(["api", `/repos/${repo}/actions/runs/${runId}`]);
  const total = Number(run.run_attempt ?? 1);
  const attempts = [];

  for (let attempt = 1; attempt <= total; attempt += 1) {
    let jobs;
    try {
      jobs = failedJobsForRun(repo, runId, attempt);
    } catch (error) {
      attempts.push({
        attempt,
        logsAvailable: false,
        jobNames: [],
        specs: [],
        signatures: [],
        failureLines: [],
        reason: `attempt ${attempt} jobs could not be listed (${String(error).slice(0, 120)})`,
      });
      continue;
    }

    const jobNames = jobs.map((job) => job.name);
    const specs = new Set();
    const signatures = new Set();
    const failureLines = [];
    let readAny = false;
    let reason = null;

    for (const job of jobs) {
      let logText;
      try {
        logText = gh(["api", `/repos/${repo}/actions/jobs/${job.id}/logs`]);
      } catch (error) {
        reason = `logs for job "${job.name}" could not be fetched (${String(error).slice(0, 120)})`;
        continue;
      }
      readAny = true;
      const signals = extractSignals(logText);
      signals.specs.forEach((s) => specs.add(s));
      signals.signatures.forEach((s) => signatures.add(s));
      failureLines.push(...signals.failureLines);
    }

    attempts.push({
      attempt,
      logsAvailable: readAny,
      jobNames,
      specs: [...specs].sort(),
      signatures: [...signatures].sort(),
      failureLines: failureLines.slice(0, 12),
      reason: readAny ? null : (reason ?? "no failing jobs reported logs"),
    });
  }

  return { attempts, runUrl: run.html_url };
}

// Best-effort, mirroring scripts/agent/selfmerge-window.mjs (owner decision
// 2026-08-05, no-fallback chosen knowingly): a failed send is reported in the
// PR comment and the guard continues without a notice.
function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return "telegram: secrets not set; no notice was sent.";
  }
  try {
    execFileSync(
      "curl",
      [
        "-s",
        "-m",
        "10",
        `https://api.telegram.org/bot${token}/sendMessage`,
        "-d",
        `chat_id=${chatId}`,
        "--data-urlencode",
        `text=${text}`,
      ],
      { encoding: "utf8" },
    );
    return null;
  } catch (error) {
    return `telegram: send failed (${String(error).slice(0, 120)}); no notice was sent.`;
  }
}

function runDiagnose(argv) {
  const repo = repoSlug(argv);
  const pr = String(argv.pr ?? "");
  const runId = String(argv["run-id"] ?? "");
  if (!pr || !runId) throw new Error("--diagnose requires --pr and --run-id.");

  let attempts = [];
  let runUrl = "";
  let collectError = null;
  try {
    ({ attempts, runUrl } = collectAttempts(repo, runId));
  } catch (error) {
    collectError = String(error).slice(0, 200);
  }

  const classification = collectError
    ? classifyAttempts([
        { attempt: 1, logsAvailable: false, reason: collectError },
      ])
    : classifyAttempts(attempts);

  const failedJobNames = [
    ...new Set(attempts.flatMap((a) => a.jobNames ?? [])),
  ];
  const marker = renderMarker({
    failedRunId: runId,
    failedJobNames,
    verdict: classification.verdict,
  });

  const prNumber = pr.split("/").pop();
  const telegramProblem = sendTelegram(
    renderTelegramNotice({ prNumber, prUrl: pr, classification }),
  );

  let body = renderDiagnosisComment({
    classification,
    attempts,
    runUrl,
    marker,
  });
  if (telegramProblem) body += `\n\n_${telegramProblem}_`;

  gh(["pr", "comment", pr, "--body", body]);
  console.log(`Diagnosis posted on ${pr}: ${classification.verdict}`);
}

function prContext(repo, prNumber) {
  const pr = ghJson([
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repo,
    "--json",
    "number,state,labels,headRefName,autoMergeRequest,comments,url",
  ]);
  return {
    number: pr.number,
    state: pr.state,
    labels: (pr.labels ?? []).map((label) => label.name),
    headRef: pr.headRefName,
    autoMergeArmed: Boolean(pr.autoMergeRequest),
    comments: pr.comments ?? [],
    url: pr.url,
  };
}

function ensureLabel(repo, name, color, description) {
  try {
    gh([
      "label",
      "create",
      name,
      "--repo",
      repo,
      "--color",
      color,
      "--description",
      description,
    ]);
  } catch {
    // Already exists (or cannot be created): adding it below will tell us.
  }
}

function runConfirmArm(argv) {
  const repo = repoSlug(argv);
  const context = prContext(repo, argv.pr);
  const result = evaluateConfirmArm(context);

  if (result.arm) {
    gh([
      "pr",
      "merge",
      String(context.number),
      "--repo",
      repo,
      "--squash",
      "--auto",
    ]);
    gh([
      "pr",
      "comment",
      String(context.number),
      "--repo",
      repo,
      "--body",
      result.comment,
    ]);
    console.log(`ARMED auto-merge for PR #${context.number}: ${result.reason}`);
    return;
  }
  if (result.comment) {
    gh([
      "pr",
      "comment",
      String(context.number),
      "--repo",
      repo,
      "--body",
      result.comment,
    ]);
  }
  console.log(`Not armed: ${result.reason}`);
}

function runStandDown(argv) {
  const repo = repoSlug(argv);
  const revertRunId = String(argv["revert-run-id"] ?? "");
  if (!revertRunId) throw new Error("--stand-down requires --revert-run-id.");

  const context = prContext(repo, argv.pr);
  const marker = parseMarker(context.comments);

  let mainFailedJobNames = marker?.failedJobNames ?? [];
  if (mainFailedJobNames.length === 0 && marker?.failedRunId) {
    try {
      mainFailedJobNames = failedJobsForRun(repo, marker.failedRunId).map(
        (job) => job.name,
      );
    } catch {
      mainFailedJobNames = [];
    }
  }

  const revertFailedJobNames = failedJobsForRun(repo, revertRunId).map(
    (job) => job.name,
  );

  const result = evaluateStandDown({
    mainFailedJobNames,
    revertFailedJobNames,
    autoMergeArmed: context.autoMergeArmed,
  });

  if (!result.standDown) {
    console.log(`No stand-down: ${result.reason}`);
    return;
  }

  ensureLabel(
    repo,
    WONT_FIX_LABEL,
    "B60205",
    "A guard revert PR whose own CI shows the same job still failing: reverting will not fix main.",
  );
  gh([
    "pr",
    "edit",
    String(context.number),
    "--repo",
    repo,
    "--add-label",
    WONT_FIX_LABEL,
  ]);
  if (result.disarm) {
    gh([
      "pr",
      "merge",
      String(context.number),
      "--repo",
      repo,
      "--disable-auto",
    ]);
  }
  gh([
    "pr",
    "comment",
    String(context.number),
    "--repo",
    repo,
    "--body",
    result.comment,
  ]);
  console.log(`Stood down PR #${context.number}: ${result.reason}`);
}

// ---------------------------------------------------------------------------
// Fixtures + self-test (real 2026-08-05 signatures, PR #841)
// ---------------------------------------------------------------------------

export const FIXTURES = {
  // main run 31039290572, attempt 1: deep-equality failure at 12.4s.
  mainAttempt1: `
2026-08-05T18:41:02.1Z Running 41 tests using 4 workers
2026-08-05T18:41:44.9Z   1) [signed-in] › tests/e2e/plan-port-truth.spec.ts:271:5 › plan surface truth › ports every plan row
2026-08-05T18:41:44.9Z     Error: expect(received).toEqual(expected) // deep equality
2026-08-05T18:41:44.9Z     - Expected  - 1
2026-08-05T18:41:44.9Z     + Received  + 1
2026-08-05T18:41:45.0Z   ✘  12 [signed-in] › tests/e2e/plan-port-truth.spec.ts:271:5 › plan surface truth › ports every plan row (12.4s)
2026-08-05T18:41:46.0Z   1 failed
`,
  // main run 31039290572, attempt 2: same spec, click timeout at 60s.
  mainAttempt2: `
2026-08-05T19:02:11.4Z Running 41 tests using 4 workers
2026-08-05T19:03:14.2Z   1) [signed-in] › tests/e2e/plan-port-truth.spec.ts:271:5 › plan surface truth › ports every plan row
2026-08-05T19:03:14.2Z     TimeoutError: locator.click: Timeout 60000ms exceeded.
2026-08-05T19:03:14.3Z   ✘  12 [signed-in] › tests/e2e/plan-port-truth.spec.ts:271:5 › plan surface truth › ports every plan row (1.0m)
2026-08-05T19:03:15.0Z   1 failed
`,
  // revert PR #841 run 31040629745: a different spec, PGRST303.
  revertRun: `
2026-08-05T19:44:02.9Z   1) [signed-in] › tests/e2e/signed-in-account-truth.spec.ts:205:5 › account truth › criterion 3
2026-08-05T19:44:02.9Z     Error: PGRST303: JWT expired
2026-08-05T19:44:03.1Z   ✘  3 [signed-in] › tests/e2e/signed-in-account-truth.spec.ts:205:5 › account truth › criterion 3 (5.2s)
`,
};

function attemptFromFixture(attempt, logText) {
  const signals = extractSignals(logText);
  return {
    attempt,
    logsAvailable: true,
    jobNames: ["Playwright E2E (signed-in)"],
    ...signals,
  };
}

export function selfTestCases() {
  const a1 = attemptFromFixture(1, FIXTURES.mainAttempt1);
  const a2 = attemptFromFixture(2, FIXTURES.mainAttempt2);
  const revert = attemptFromFixture(1, FIXTURES.revertRun);
  return { a1, a2, revert };
}

export function runSelfTest() {
  const { a1, a2, revert } = selfTestCases();

  // Extraction pulls the real coordinates and mechanisms out of the logs.
  assert.deepEqual(a1.specs, ["tests/e2e/plan-port-truth.spec.ts:271"]);
  assert.ok(a1.signatures.includes("deep-equality"));
  assert.ok(a2.signatures.includes("timeout"));
  assert.ok(revert.signatures.includes("postgrest"));
  assert.ok(
    a1.failureLines.some((line) => line.includes("✘")),
    "the ✘ line is quoted back verbatim",
  );

  // Branch 1 — the real 2026-08-05 main red: same spec, two different
  // mechanisms. Must NOT read as "the change is broken".
  const nondet = classifyAttempts([a1, a2]);
  assert.equal(nondet.verdict, VERDICTS.NONDETERMINISTIC);
  assert.match(nondet.headline, /revert probably will not fix this/);

  // Branch 1b — same spec, same mechanism twice: the change is suspect.
  const repeated = classifyAttempts([a1, { ...a1, attempt: 2 }]);
  assert.equal(repeated.verdict, VERDICTS.CHANGE_SUSPECT);
  assert.match(repeated.headline, /read the failure before reverting/);

  // Branch 2 — different specs across attempts: environment/flaky tier.
  const env = classifyAttempts([a1, { ...revert, attempt: 2 }]);
  assert.equal(env.verdict, VERDICTS.ENVIRONMENT);
  assert.match(env.headline, /revert probably will not fix this/);

  // Degrade path — logs expired: never a confident verdict.
  const expired = classifyAttempts([
    { attempt: 1, logsAvailable: false, reason: "logs expired" },
    { attempt: 2, logsAvailable: false, reason: "logs expired" },
  ]);
  assert.equal(expired.verdict, VERDICTS.INCONCLUSIVE);
  assert.match(expired.detail, /diagnosis unavailable: logs expired/);

  // Degrade path — only one readable attempt: refuse to compare.
  const single = classifyAttempts([
    a1,
    { attempt: 2, logsAvailable: false, reason: "logs expired" },
  ]);
  assert.equal(single.verdict, VERDICTS.INCONCLUSIVE);
  assert.match(single.detail, /Only one attempt/);

  // The comment always states the hold and round-trips the marker.
  const marker = renderMarker({
    failedRunId: "31039290572",
    failedJobNames: ["Playwright E2E (signed-in)"],
    verdict: nondet.verdict,
  });
  const comment = renderDiagnosisComment({
    classification: nondet,
    attempts: [a1, a2],
    runUrl: "https://example.invalid/run",
    marker,
  });
  assert.match(comment, /This revert is HELD/);
  assert.match(comment, /plan-port-truth\.spec\.ts:271/);
  const parsed = parseMarker([{ body: comment }]);
  assert.equal(parsed.failedRunId, "31039290572");
  assert.deepEqual(parsed.failedJobNames, ["Playwright E2E (signed-in)"]);
  assert.equal(parseMarker([{ body: "no marker here" }]), null);

  // Telegram notice compresses to two lines.
  const notice = renderTelegramNotice({
    prNumber: 841,
    prUrl: "https://example.invalid/pr/841",
    classification: nondet,
  });
  assert.equal(notice.split("\n").length, 2);
  assert.match(notice, /HELD/);

  // Confirm-to-arm.
  const base = { state: "OPEN", headRef: "guard/revert-main-360cce42" };
  assert.equal(
    evaluateConfirmArm({ ...base, labels: [CONFIRM_LABEL] }).arm,
    true,
  );
  assert.equal(evaluateConfirmArm({ ...base, labels: [] }).arm, false);
  const conflict = evaluateConfirmArm({
    ...base,
    labels: [CONFIRM_LABEL, WONT_FIX_LABEL],
  });
  assert.equal(conflict.arm, false);
  assert.match(conflict.comment, /would not restore green/);
  assert.equal(
    evaluateConfirmArm({ ...base, labels: [CONFIRM_LABEL], state: "CLOSED" })
      .arm,
    false,
  );
  assert.equal(
    evaluateConfirmArm({
      ...base,
      labels: [CONFIRM_LABEL],
      headRef: "claude/some-feature",
    }).arm,
    false,
  );

  // Stand-down: same job name failing on the revert too.
  const standDown = evaluateStandDown({
    mainFailedJobNames: ["Playwright E2E (signed-in)", "Monorepo Validation"],
    revertFailedJobNames: ["Playwright E2E (signed-in)"],
    autoMergeArmed: true,
  });
  assert.equal(standDown.standDown, true);
  assert.equal(standDown.disarm, true);
  assert.deepEqual(standDown.overlap, ["Playwright E2E (signed-in)"]);
  assert.match(standDown.comment, /does not fix main/);
  assert.match(standDown.comment, /disarmed/);

  const noOverlap = evaluateStandDown({
    mainFailedJobNames: ["Playwright E2E (signed-in)"],
    revertFailedJobNames: ["Monorepo Validation"],
    autoMergeArmed: false,
  });
  assert.equal(noOverlap.standDown, false);

  const unknown = evaluateStandDown({
    mainFailedJobNames: [],
    revertFailedJobNames: ["Monorepo Validation"],
    autoMergeArmed: false,
  });
  assert.equal(unknown.standDown, false);
  assert.match(unknown.reason, /unknown/);

  console.log("red-guard-diagnose self-tests passed.");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgv(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const isDirectRun =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("red-guard-diagnose.mjs");

if (isDirectRun) {
  const argv = parseArgv(process.argv.slice(2));
  try {
    if (argv["self-test"]) runSelfTest();
    else if (argv.diagnose) runDiagnose(argv);
    else if (argv["confirm-arm"]) runConfirmArm(argv);
    else if (argv["stand-down"]) runStandDown(argv);
    else {
      console.error(
        "usage: red-guard-diagnose.mjs --diagnose --pr <url|number> --run-id <id>\n" +
          "       red-guard-diagnose.mjs --confirm-arm --pr <number>\n" +
          "       red-guard-diagnose.mjs --stand-down --pr <number> --revert-run-id <id>\n" +
          "       red-guard-diagnose.mjs --self-test",
      );
      process.exit(2);
    }
  } catch (error) {
    if (argv.diagnose) {
      // Requirement: diagnosis must never block the revert PR from existing.
      console.error(`diagnosis unavailable: ${String(error).slice(0, 300)}`);
      process.exit(0);
    }
    throw error;
  }
}
