#!/usr/bin/env node

// Sole PR auto-merge writer. Safe Auto-merge supplies a head-bound verdict.
// CI completion re-evaluates fresh state. Callers serialize on pr-automerge-<head>.
// Existing ADR 0008 route policies and notification gates remain independent.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { classifyCombinedEligibility } from "./check-safe-automerge.mjs";
import { evaluateConfirmArm } from "./red-guard-diagnose.mjs";
import process from "node:process";

import {
  SAFE_AUTOMERGE_BLOCKING_LABELS,
  SELFMERGE_WINDOW,
  evaluateAutomationPolicy,
  evaluateOwnerGateBlock,
} from "./automation-policy.mjs";

const MARKER_PREFIX = "<!-- selfmerge-window:";

export function evaluateSelfmergeCandidate({
  enabled,
  labels,
  draft,
  title,
  body,
  mergeStateStatus,
  mainHealthy,
  guardRevertOpen,
  reviewDecision,
  changedPaths,
  headSha,
  notifiedHeadSha,
  notifiedAtIso,
  nowIso,
  windowMinutes,
}) {
  const reasons = [];

  if (!enabled) {
    reasons.push(
      "Self-merge window class is disabled (SELFMERGE_WINDOW.enabled=false).",
    );
    return { armable: false, reasons, renotify: false };
  }

  // Owner decision 2026-08-30 (post-#935): the owner-gate/ratification
  // block applies to this lane too, checked before the label/path rules
  // below — a PR must never self-merge while it applies, no matter how it
  // otherwise scores. (Draft is enforced separately, a few lines down —
  // it isn't part of evaluateOwnerGateBlock, see the comment on
  // OWNER_GATE_LABEL in automation-policy.mjs for why.)
  const ownerGate = evaluateOwnerGateBlock({ title, body, labels });
  if (ownerGate.blocked) {
    reasons.push(...ownerGate.reasons);
    return { armable: false, reasons, renotify: false };
  }

  if (!SELFMERGE_WINDOW.labels.some((l) => labels.includes(l))) {
    reasons.push(`Missing opt-in label \`${SELFMERGE_WINDOW.labels[0]}\`.`);
  }
  if (!labels.includes("risk:low")) {
    reasons.push("Missing required label `risk:low`.");
  }
  for (const label of SAFE_AUTOMERGE_BLOCKING_LABELS) {
    if (labels.includes(label)) {
      reasons.push(`Blocking label present: \`${label}\`.`);
    }
  }
  if (draft) {
    reasons.push("Pull request is still a draft.");
  }
  if (reviewDecision === "CHANGES_REQUESTED") {
    reasons.push("A review requests changes.");
  }
  if (!mainHealthy) {
    reasons.push("Main is not green — self-merge lane pauses on red main.");
  }
  if (guardRevertOpen) {
    reasons.push("A Main Red Guard revert PR is open — lane paused.");
  }
  // Instant mode: arm while checks run — GitHub auto-merge + branch
  // protection are the gate. Only a conflicted PR cannot arm.
  if (mergeStateStatus === "DIRTY") {
    reasons.push("PR has merge conflicts — resolve before arming.");
  }

  if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
    reasons.push("No changed files were detected.");
  } else {
    const policyResult = evaluateAutomationPolicy("low-risk", changedPaths);
    for (const violation of policyResult.violations) {
      reasons.push(
        `T2+ path touched: \`${violation.path}\` matched \`${violation.pattern}\`.`,
      );
    }
  }

  if (!notifiedAtIso || !notifiedHeadSha) {
    reasons.push(
      "Owner notification comment not found — clock has not started.",
    );
    return { armable: false, reasons, renotify: true };
  }

  if (notifiedHeadSha !== headSha) {
    reasons.push(
      "New commits arrived after the notification — clock resets with a fresh notification.",
    );
    return { armable: false, reasons, renotify: true };
  }

  const elapsedMs = Date.parse(nowIso) - Date.parse(notifiedAtIso);
  const windowMs =
    (windowMinutes ?? SELFMERGE_WINDOW.windowMinutes) * 60 * 1000;
  if (!(elapsedMs >= windowMs)) {
    const remaining = Math.max(0, Math.ceil((windowMs - elapsedMs) / 60000));
    reasons.push(`Window still open: ~${remaining} min remaining.`);
  }

  return { armable: reasons.length === 0, reasons, renotify: false };
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function parseMarker(comments) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const body = comments[index]?.body ?? "";
    const start = body.indexOf(MARKER_PREFIX);
    if (start === -1) continue;
    const end = body.indexOf("-->", start);
    if (end === -1) continue;
    try {
      const payload = JSON.parse(
        body.slice(start + MARKER_PREFIX.length, end).trim(),
      );
      if (payload.headSha && payload.notifiedAt) return payload;
    } catch {
      // Malformed marker: ignore and keep looking at older comments.
    }
  }
  return null;
}

function postNotification(prNumber, headSha) {
  const notifiedAt = new Date().toISOString();
  const armAt = new Date(
    Date.parse(notifiedAt) + SELFMERGE_WINDOW.windowMinutes * 60 * 1000,
  ).toISOString();
  const marker = `${MARKER_PREFIX} ${JSON.stringify({ headSha, notifiedAt })} -->`;
  const body = [
    marker,
    `@${SELFMERGE_WINDOW.ownerLogin} — this low-risk PR opted into the ADR 0008 self-merge window.`,
    ``,
    `It arms auto-merge at **${armAt}** (${SELFMERGE_WINDOW.windowMinutes} minutes from this notice) if by then: CI is green, main is green, no blocking label or changes-requested review appears, and no new commits arrive (new commits reset this clock).`,
    ``,
    `To stop it: add \`needs:human-decision\`, request changes, or close the PR.`,
  ].join("\n");
  gh(["pr", "comment", String(prNumber), "--body", body]);
  sendTelegram(prNumber);
  console.log(
    `notified PR #${prNumber} at ${notifiedAt} (head ${headSha.slice(0, 8)})`,
  );
}

// Best-effort by owner decision 2026-08-05 (no-fallback chosen knowingly):
// a failed send logs a warning and the merge proceeds regardless.
function sendTelegram(
  prNumber,
  { execute = execFileSync, readPr = ghJson } = {},
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log(
      "telegram: secrets not set; skipping notice (instant mode continues).",
    );
    return;
  }
  try {
    const pr = readPr(["pr", "view", String(prNumber), "--json", "title,url"]);
    const text = `LifeOS PR #${prNumber} — ${pr.title}
Merges when tests pass. Stop it: add needs:human-decision or close ${pr.url}`;
    execute(
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
      { encoding: "utf8", stdio: "pipe" },
    );
    console.log("telegram: notice sent.");
  } catch {
    console.log(
      "telegram: send failed; instant mode continues per owner decision.",
    );
  }
}

// Sole mutation boundary. Preserve the previously CLI-owned routes' behavior:
// --auto also completes already-green PRs, still subject to GitHub's checks.
export function writeAutoMerge(
  {
    id,
    enabled,
    headSha,
    mergeWhenReady = false,
    number,
    repo = process.env.GH_REPO,
  },
  { graphql = graphqlRequest, execute = gh } = {},
) {
  if (typeof id !== "string" || !id) throw new Error("Missing PR node id.");
  if (typeof enabled !== "boolean")
    throw new Error("Missing auto-merge decision.");
  if (enabled && (typeof headSha !== "string" || !headSha))
    throw new Error("Missing approved head SHA.");
  if (enabled && mergeWhenReady) {
    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")
    )
      throw new Error("Missing PR identity for the confirmed CLI route.");
    execute([
      "pr",
      "merge",
      String(number),
      "--repo",
      repo,
      "--squash",
      "--auto",
      "--match-head-commit",
      headSha,
    ]);
    return { action: "armed-or-merged" };
  }
  const mutation = enabled
    ? "mutation($id:ID!,$head:GitObjectID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH,expectedHeadOid:$head}){pullRequest{number}}}"
    : "mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{number}}}";
  try {
    graphql(mutation, id, enabled ? headSha : undefined);
    return { action: enabled ? "enabled" : "disabled" };
  } catch (error) {
    const message = String(error?.stderr ?? error?.message ?? error);
    if (enabled) {
      if (/already enabled/i.test(message))
        return { action: "already-enabled" };
      throw error;
    }
    if (
      /auto-merge is disabled|auto-merge is not enabled|already disabled|not currently enabled/i.test(
        message,
      )
    )
      return { action: "not-enabled" };
    // A permission error is not proof of disabled state. Read back once.
    let node;
    try {
      ({ node } = graphql(
        "query($id:ID!){node(id:$id){__typename ... on PullRequest{autoMergeRequest{enabledAt}}}}",
        id,
      ));
    } catch {
      /* Unknown remains a failure. */
    }
    if (
      node?.__typename === "PullRequest" &&
      Object.hasOwn(node, "autoMergeRequest") &&
      node.autoMergeRequest === null
    )
      return { action: "not-enabled" };
    throw new Error("Could not confirm auto-merge is disabled.");
  }
}

function graphqlRequest(query, id, headSha) {
  const response = ghJson([
    "api",
    "graphql",
    "-f",
    "query=" + query,
    "-f",
    "id=" + id,
    ...(headSha ? ["-f", "head=" + headSha] : []),
  ]);
  if (response.errors?.length)
    throw new Error("Auto-merge GraphQL request failed.");
  return response.data;
}

// A negative safe verdict does not veto an independently eligible self-merge
// route. Failed or stale handoffs cannot arm any route.
export function evaluateAutoMerge(context, health, safeVerdict = undefined) {
  const deny = (reason) => ({
    enabled: false,
    renotify: false,
    reasons: [reason],
  });
  if (context.state !== "OPEN" || context.draft !== false)
    return deny("PR is closed, draft, or unreadable.");
  const ownerGate = evaluateOwnerGateBlock(context);
  if (ownerGate.blocked) return deny(ownerGate.reasons.join(" "));
  if (
    safeVerdict !== undefined &&
    (!safeVerdict ||
      typeof safeVerdict.eligible !== "boolean" ||
      safeVerdict.number !== context.number ||
      safeVerdict.headSha !== context.headSha ||
      safeVerdict.baseSha !== context.baseSha)
  )
    return deny("Failed or stale safe eligibility handoff.");
  // A held recovery or stand-down must never be bypassed by ordinary labels.
  if (context.headRef?.startsWith("guard/revert-main-")) {
    const recovery = evaluateConfirmArm(context);
    return {
      enabled: recovery.arm,
      mergeWhenReady: recovery.arm,
      renotify: false,
      reasons: [recovery.reason],
    };
  }
  const safe = classifyCombinedEligibility(context);
  const self = evaluateSelfmergeCandidate({
    enabled: SELFMERGE_WINDOW.enabled,
    ...context,
    ...health,
    nowIso: new Date().toISOString(),
    windowMinutes: SELFMERGE_WINDOW.windowMinutes,
  });
  const safeEligible =
    safe.eligible && (safeVerdict === undefined || safeVerdict.eligible);
  return {
    enabled: safeEligible || self.armable,
    mergeWhenReady: self.armable,
    renotify:
      !safeEligible &&
      self.renotify &&
      SELFMERGE_WINDOW.enabled &&
      SELFMERGE_WINDOW.labels.some((label) => context.labels.includes(label)),
    reasons: safeEligible ? [] : self.reasons,
  };
}

function mainHealth() {
  const runs = ghJson([
    "run",
    "list",
    "--branch",
    "main",
    "--workflow",
    "ci.yml",
    "--limit",
    "1",
    "--json",
    "conclusion,status",
  ]);
  const latest = runs[0];
  const mainHealthy =
    !latest ||
    (latest.status === "completed" && latest.conclusion === "success");
  const reverts = ghJson([
    "pr",
    "list",
    "--state",
    "open",
    "--search",
    "Auto-revert in:title",
    "--json",
    "number",
  ]);
  return { mainHealthy, guardRevertOpen: reverts.length > 0 };
}

export function collectPr(
  prNumber,
  { repo = process.env.GH_REPO, read = ghJson } = {},
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? ""))
    throw new Error("GH_REPO must identify the repository.");
  const args = [
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repo,
    "--json",
    "id,number,state,labels,isDraft,mergeStateStatus,reviewDecision,headRefName,headRefOid,baseRefOid,changedFiles,comments,title,body,autoMergeRequest",
  ];
  const pr = read(args);
  const pages = read([
    "api",
    "--paginate",
    "--slurp",
    "repos/" + repo + "/pulls/" + prNumber + "/files?per_page=100",
  ]);
  const files = pages.flat();
  if (
    !Number.isInteger(pr.changedFiles) ||
    files.length !== pr.changedFiles ||
    files.some((file) => typeof file.filename !== "string")
  )
    throw new Error("Incomplete PR file list.");
  const latest = read(args);
  const identity = (value) =>
    JSON.stringify([
      value.id,
      value.number,
      value.state,
      value.headRefOid,
      value.baseRefOid,
      value.labels,
      value.isDraft,
      value.title,
      value.body,
      value.reviewDecision,
      value.changedFiles,
    ]);
  if (identity(pr) !== identity(latest))
    throw new Error("PR changed during collection; retry on the next event.");
  if (
    !pr.id ||
    pr.number !== Number(prNumber) ||
    !pr.headRefOid ||
    !pr.baseRefOid ||
    !Array.isArray(pr.labels)
  )
    throw new Error("Unreadable PR identity.");
  const marker = parseMarker(pr.comments ?? []);
  const statuses = {
    added: "A",
    modified: "M",
    removed: "D",
    renamed: "R",
    copied: "C",
  };
  return {
    id: pr.id,
    number: pr.number,
    state: pr.state,
    headRef: pr.headRefName,
    labels: pr.labels.map((label) => label.name),
    draft: pr.isDraft,
    title: pr.title,
    body: pr.body,
    mergeStateStatus: pr.mergeStateStatus,
    reviewDecision: pr.reviewDecision ?? "",
    changedPaths: files.map((file) => file.filename),
    diffStats: files.map((file) => ({
      path: file.filename,
      status: statuses[file.status] ?? "?",
      added: typeof file.patch === "string" ? file.additions : null,
      deleted: typeof file.patch === "string" ? file.deletions : null,
    })),
    headSha: pr.headRefOid,
    baseSha: pr.baseRefOid,
    notifiedHeadSha: marker?.headSha ?? null,
    notifiedAtIso: marker?.notifiedAt ?? null,
  };
}

function runReconcile() {
  const number = Number(process.env.PR_NUMBER);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error("PR_NUMBER is required.");
  let context;
  try {
    let verdict;
    if (Object.hasOwn(process.env, "SAFE_VERDICT")) {
      try {
        verdict = JSON.parse(process.env.SAFE_VERDICT);
      } catch {
        verdict = null;
      }
    }
    context = collectPr(number);
    if (context.state !== "OPEN") return;
    const health = mainHealth();
    let decision = evaluateAutoMerge(context, health, verdict);
    if (decision.renotify) {
      postNotification(number, context.headSha);
      context = collectPr(number);
      decision = evaluateAutoMerge(context, health, verdict);
    }
    const result = writeAutoMerge({
      id: context.id,
      number,
      headSha: context.headSha,
      enabled: decision.enabled,
      mergeWhenReady: decision.mergeWhenReady,
    });
    console.log(
      JSON.stringify({ number, ...result, reasons: decision.reasons }),
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        "PR #" + number + ": " + result.action + "\n",
      );
  } catch (error) {
    // A failed evaluator cannot leave an old approval armed. Resolve only the
    // identity when the richer read failed; mutation failure stays visible.
    const id =
      context?.id ?? ghJson(["pr", "view", String(number), "--json", "id"]).id;
    writeAutoMerge({ id, enabled: false });
    throw error;
  }
}

function runSelfTest() {
  const eligible = {
    enabled: true,
    labels: [SELFMERGE_WINDOW.labels[0], "risk:low"],
    draft: false,
    title: "fix(areas): tidy loading state",
    body: "Routine cleanup, no open questions.",
    mergeStateStatus: "CLEAN",
    mainHealthy: true,
    guardRevertOpen: false,
    reviewDecision: "",
    changedPaths: ["apps/web/src/app/components/moments/PlanSheet.tsx"],
    headSha: "abc123",
    notifiedHeadSha: "abc123",
    notifiedAtIso: "2026-08-04T00:00:00.000Z",
    nowIso: "2026-08-04T00:31:00.000Z",
    windowMinutes: 30,
  };

  const cases = [
    {
      name: "armable after window",
      input: eligible,
      expected: { armable: true },
    },
    {
      name: "window still open blocks",
      input: { ...eligible, nowIso: "2026-08-04T00:15:00.000Z" },
      expected: { armable: false, renotify: false },
    },
    {
      name: "new head resets clock and renotifies",
      input: { ...eligible, headSha: "def456" },
      expected: { armable: false, renotify: true },
    },
    {
      name: "no notification yet renotifies",
      input: { ...eligible, notifiedHeadSha: null, notifiedAtIso: null },
      expected: { armable: false, renotify: true },
    },
    {
      name: "red main pauses lane",
      input: { ...eligible, mainHealthy: false },
      expected: { armable: false },
    },
    {
      name: "open guard revert pauses lane",
      input: { ...eligible, guardRevertOpen: true },
      expected: { armable: false },
    },
    {
      name: "T2 path blocks",
      input: { ...eligible, changedPaths: [".github/workflows/ci.yml"] },
      expected: { armable: false },
    },
    {
      name: "blocking label blocks",
      input: {
        ...eligible,
        labels: [...eligible.labels, "needs:human-decision"],
      },
      expected: { armable: false },
    },
    {
      name: "changes-requested review blocks",
      input: { ...eligible, reviewDecision: "CHANGES_REQUESTED" },
      expected: { armable: false },
    },
    // 2026-10-17: the 10-minute cron was removed from selfmerge-window.yml
    // because the live policy has no timer to wait out: notify arms at the
    // notify instant, and every CI completion (PR or main) re-runs the scan.
    // If windowMinutes is ever raised above 0, this case fails: restore a
    // schedule trigger in the workflow before changing the expectation.
    {
      name: "live policy arms at the notify instant (no timer, so no cron needed)",
      input: {
        ...eligible,
        nowIso: eligible.notifiedAtIso,
        windowMinutes: SELFMERGE_WINDOW.windowMinutes,
      },
      expected: { armable: true },
    },
    {
      name: "pending checks do NOT block instant arming (auto-merge waits on them)",
      input: { ...eligible, mergeStateStatus: "BLOCKED" },
      expected: { armable: true },
    },
    {
      name: "merge conflicts block arming",
      input: { ...eligible, mergeStateStatus: "DIRTY" },
      expected: { armable: false },
    },
    {
      name: "disabled class blocks everything",
      input: { ...eligible, enabled: false },
      expected: { armable: false },
    },
    {
      name: "draft blocks",
      input: { ...eligible, draft: true },
      expected: { armable: false },
    },
    // Owner decision 2026-08-30 (post-#935): the same owner-gate block as
    // the safe-automerge lane, layered above this lane's own checks. The
    // last fixture is the control — otherwise-armable PR, no block
    // condition — proving the gate doesn't false-positive.
    {
      name: "REFUSE: unchecked OWNER-GATE checkbox in body",
      input: {
        ...eligible,
        body: "Summary.\n\n- [ ] OWNER-GATE: confirm the migration plan.\n",
      },
      expected: { armable: false },
    },
    // GFM checkbox-bypass variants (verifier finding, HIGH).
    {
      name: "REFUSE: `*` bullet instead of `-`",
      input: { ...eligible, body: "Summary.\n\n* [ ] OWNER-GATE: confirm.\n" },
      expected: { armable: false },
    },
    {
      name: "REFUSE: `+` bullet instead of `-`",
      input: { ...eligible, body: "Summary.\n\n+ [ ] OWNER-GATE: confirm.\n" },
      expected: { armable: false },
    },
    {
      name: "REFUSE: empty box `[]` (no space)",
      input: { ...eligible, body: "Summary.\n\n- [] OWNER-GATE: confirm.\n" },
      expected: { armable: false },
    },
    {
      name: "REFUSE: box with two spaces `[  ]`",
      input: {
        ...eligible,
        body: "Summary.\n\n- [  ] OWNER-GATE: confirm.\n",
      },
      expected: { armable: false },
    },
    {
      name: "REFUSE: blockquoted checkbox line `> - [ ]`",
      input: {
        ...eligible,
        body: "Summary.\n\n> - [ ] OWNER-GATE: confirm.\n",
      },
      expected: { armable: false },
    },
    {
      name: "REFUSE: OWNER RATIFICATION REQUIRED in body (#935 shape)",
      input: {
        ...eligible,
        body: "## OWNER RATIFICATION REQUIRED\n\nNeeds sign-off.",
      },
      expected: { armable: false },
    },
    {
      name: "REFUSE: OWNER-GATE heading in body",
      input: { ...eligible, body: "## OWNER-GATE\n\nDo not merge yet." },
      expected: { armable: false },
    },
    {
      name: "REFUSE: owner-gate label present",
      input: { ...eligible, labels: [...eligible.labels, "owner-gate"] },
      expected: { armable: false },
    },
    {
      name: "REFUSE: body could not be read — fails closed",
      input: { ...eligible, body: null },
      expected: { armable: false },
    },
    {
      name: "ALLOW: same PR shape, checked OWNER-GATE box doesn't block",
      input: {
        ...eligible,
        body: "Summary.\n\n- [x] OWNER-GATE: resolved, see comment.\n",
      },
      expected: { armable: true },
    },
  ];

  for (const testCase of cases) {
    const result = evaluateSelfmergeCandidate(testCase.input);
    assert.equal(
      result.armable,
      testCase.expected.armable,
      `${testCase.name}: armable`,
    );
    if ("renotify" in testCase.expected) {
      assert.equal(
        result.renotify,
        testCase.expected.renotify,
        `${testCase.name}: renotify`,
      );
    }
  }

  const savedEnv = process.env;
  const savedStdoutWrite = process.stdout.write;
  const savedStderrWrite = process.stderr.write;
  const output = [];
  const captureWrite = (chunk) => {
    output.push(String(chunk));
    return true;
  };
  const syntheticToken = "SYNTHETIC_NOTIFIER_MARKER";
  let calls = 0;
  let executeOptions;
  const failSend = (command, _args, options) => {
    calls += 1;
    assert.equal(command, "curl");
    executeOptions = options;
    throw Object.assign(new Error(syntheticToken), {
      stdout: Buffer.from(syntheticToken),
      stderr: Buffer.from(syntheticToken),
    });
  };
  try {
    process.env = {};
    process.stdout.write = captureWrite;
    process.stderr.write = captureWrite;
    const readPr = () => ({
      title: "Synthetic notice",
      url: "https://example.invalid/pr/1",
    });
    assert.equal(sendTelegram(1, { execute: failSend, readPr }), undefined);
    assert.equal(calls, 0, "missing credentials never execute curl");
    assert.match(output.join(""), /secrets not set/);
    output.length = 0;
    process.env = {
      TELEGRAM_BOT_TOKEN: syntheticToken,
      TELEGRAM_CHAT_ID: "SYNTHETIC_CHAT",
    };
    assert.equal(sendTelegram(1, { execute: failSend, readPr }), undefined);
    assert.equal(
      output.join("").includes(syntheticToken),
      false,
      "safe output",
    );
    assert.match(output.join(""), /send failed.*instant mode continues/);
    assert.equal(executeOptions.stdio, "pipe", "child output is captured");
    assert.equal(calls, 1, "injected send only; no network");
    output.length = 0;
    assert.equal(sendTelegram(1, { execute: () => "ok", readPr }), undefined);
    assert.match(output.join(""), /notice sent/);
  } finally {
    process.env = savedEnv;
    process.stdout.write = savedStdoutWrite;
    process.stderr.write = savedStderrWrite;
  }

  console.log(
    `Self-test passed (${cases.length} policy cases; 3 notifier cases).`,
  );
}

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();
  if (process.argv.includes("--reconcile") || process.argv.includes("--notify"))
    return runReconcile();
  throw new Error("Usage: selfmerge-window.mjs --reconcile | --self-test");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
