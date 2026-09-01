#!/usr/bin/env node

// ADR 0008 move 2 (owner-ratified 2026-08-04): 30-minute notified
// self-merge window for risk:low, non-T2+ agent PRs.
//
// Two runtime modes plus a self-test:
//   --notify  (pull_request event): post/refresh the owner-notification
//             marker comment that starts the clock. A new head SHA resets
//             the clock with a fresh notification.
//   --scan    (cron): for every open PR carrying the opt-in label, arm
//             GitHub auto-merge iff the evaluation below passes.
//
// The evaluation is a pure function so the self-test can pin every rule.
// The clock starts at the NOTIFICATION comment (the owner-visible event),
// never at PR open.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

  // Owner decision 2026-08-30 (post-#935): the owner-gate/ratification/draft
  // block applies to this lane too, above every other check — a PR must
  // never self-merge while it applies, no matter how it otherwise scores.
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
function sendTelegram(prNumber) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log(
      "telegram: secrets not set; skipping notice (instant mode continues).",
    );
    return;
  }
  try {
    const pr = ghJson(["pr", "view", String(prNumber), "--json", "title,url"]);
    const text = `LifeOS PR #${prNumber} — ${pr.title}
Merges when tests pass. Stop it: add needs:human-decision or close ${pr.url}`;
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
    console.log("telegram: notice sent.");
  } catch (error) {
    console.log(
      `telegram: send failed (${String(error).slice(0, 120)}); instant mode continues per owner decision.`,
    );
  }
}

// Instant mode: try to arm in the same run that notified.
function armIfEligible(number) {
  const health = mainHealth();
  const context = collectPr(number);
  const result = evaluateSelfmergeCandidate({
    enabled: SELFMERGE_WINDOW.enabled,
    ...context,
    ...health,
    nowIso: new Date().toISOString(),
    windowMinutes: SELFMERGE_WINDOW.windowMinutes,
  });
  if (result.armable) {
    gh(["pr", "merge", String(number), "--squash", "--auto"]);
    console.log(`ARMED auto-merge for PR #${number} (instant mode).`);
  } else {
    const lines = result.reasons.map((r) => `  - ${r}`).join("\n");
    console.log(`PR #${number} not armed:\n${lines}`);
    disarmIfNeeded(number);
  }
}

// Owner decision 2026-08-30: a PR that lost eligibility (owner-gate applied
// after arming, a label flipped, etc.) must be disarmed, not just skipped —
// the earlier arm() call already scheduled a merge that would otherwise
// still land the moment CI turns green. Deliberately unconditional: it does
// NOT gate on `context.autoMergeArmed` first, because that flag comes from
// a `gh pr view` snapshot that can be stale (another process armed it a
// moment ago) the same way `safe-automerge.yml`'s payload-derived
// `auto_merge` flag can be stale. Always attempt the disable; treat "it
// wasn't armed anyway" as a normal, silent no-op rather than an error.
function disarmIfNeeded(number) {
  try {
    gh(["pr", "merge", String(number), "--disable-auto"]);
    console.log(`DISARMED auto-merge for PR #${number} (no longer eligible).`);
  } catch (error) {
    const message = String(error?.message ?? error);
    // Same message set safe-automerge.yml's disable branch treats as a
    // normal no-op, kept in sync deliberately (one policy, two call sites).
    if (
      /auto-merge is disabled|auto-merge is not enabled|already disabled|not currently enabled/i.test(
        message,
      )
    ) {
      // Nothing to disarm — expected on every PR that was never armed.
      return;
    }
    console.log(
      `PR #${number}: failed to disarm auto-merge: ${message.slice(0, 200)}`,
    );
  }
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

function collectPr(prNumber) {
  const pr = ghJson([
    "pr",
    "view",
    String(prNumber),
    "--json",
    "number,labels,isDraft,mergeStateStatus,reviewDecision,headRefOid,files,comments,title,body,autoMergeRequest",
  ]);
  const marker = parseMarker(pr.comments ?? []);
  // gh reports body as "" (not null) when the description is empty; a
  // failed/malformed API response would have thrown in ghJson() already,
  // so reaching here means the body was read (fail-closed lives in
  // evaluateOwnerGateBlock's typeof check for the genuinely-unreachable
  // case).
  return {
    number: pr.number,
    labels: (pr.labels ?? []).map((label) => label.name),
    draft: Boolean(pr.isDraft),
    title: typeof pr.title === "string" ? pr.title : "",
    body: typeof pr.body === "string" ? pr.body : "",
    mergeStateStatus: pr.mergeStateStatus,
    reviewDecision: pr.reviewDecision ?? "",
    changedPaths: (pr.files ?? []).map((file) => file.path),
    headSha: pr.headRefOid,
    notifiedHeadSha: marker?.headSha ?? null,
    notifiedAtIso: marker?.notifiedAt ?? null,
    autoMergeArmed: Boolean(pr.autoMergeRequest),
  };
}

function runNotify() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) {
    throw new Error("--notify requires GITHUB_EVENT_PATH.");
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest) {
    console.log("No pull_request in payload; nothing to notify.");
    return;
  }
  const labels = (pullRequest.labels ?? []).map((label) => label?.name);
  if (
    !SELFMERGE_WINDOW.labels.some((l) => labels.includes(l)) ||
    pullRequest.draft
  ) {
    console.log("PR not opted in (or draft); nothing to notify.");
    return;
  }
  const ownerGate = evaluateOwnerGateBlock({
    title: pullRequest.title,
    body: typeof pullRequest.body === "string" ? pullRequest.body : "",
    labels,
  });
  if (ownerGate.blocked) {
    console.log(
      `PR is owner-gated; skipping notify (never arms this lane either):\n${ownerGate.reasons.map((r) => `  - ${r}`).join("\n")}`,
    );
    disarmIfNeeded(pullRequest.number);
    return;
  }
  const context = collectPr(pullRequest.number);
  if (context.notifiedHeadSha !== context.headSha) {
    postNotification(pullRequest.number, context.headSha);
  } else {
    console.log("Notification for this head already exists.");
  }
  armIfEligible(pullRequest.number);
}

function runScan() {
  if (!SELFMERGE_WINDOW.enabled) {
    console.log("Self-merge window class is disabled; scan skipped.");
    return;
  }
  const health = mainHealth();
  const candidates = ghJson([
    "pr",
    "list",
    "--state",
    "open",
    "--label",
    SELFMERGE_WINDOW.labels.join(","),
    "--json",
    "number",
  ]);
  if (candidates.length === 0) {
    console.log("No opted-in PRs.");
    return;
  }
  for (const { number } of candidates) {
    const context = collectPr(number);
    const result = evaluateSelfmergeCandidate({
      enabled: SELFMERGE_WINDOW.enabled,
      ...context,
      ...health,
      nowIso: new Date().toISOString(),
      windowMinutes: SELFMERGE_WINDOW.windowMinutes,
    });
    if (result.armable) {
      gh(["pr", "merge", String(number), "--squash", "--auto"]);
      console.log(`ARMED auto-merge for PR #${number}.`);
      continue;
    }
    disarmIfNeeded(number);
    if (result.renotify) {
      postNotification(number, context.headSha);
    }
    console.log(
      `PR #${number} not armed:\n${result.reasons.map((reason) => `  - ${reason}`).join("\n")}`,
    );
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

  console.log(`Self-test passed (${cases.length} cases).`);
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }
  if (process.argv.includes("--notify")) {
    runNotify();
    return;
  }
  if (process.argv.includes("--scan")) {
    runScan();
    return;
  }
  throw new Error(
    "Usage: selfmerge-window.mjs --notify | --scan | --self-test",
  );
}

main();
