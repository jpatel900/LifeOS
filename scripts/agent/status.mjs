#!/usr/bin/env node
// Purpose: print the owner's action queue -- everything in the repo that is
// currently waiting on a human click -- so the solo owner never has to
// reconstruct state from GitHub tabs.
//
// Usage: `pnpm status` (runs `node scripts/agent/status.mjs`).
//
// This script is READ-ONLY. It only ever shells out to `gh` subcommands that
// read state (pr list, issue view/list, run list). It must never call a `gh`
// command that mutates GitHub state (merge, close, comment, label edits,
// etc.). It is a report, not a gate: it always exits 0, and every internal
// failure is caught and printed as text rather than thrown.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(__dirname, "pipeline-manifest.json");

function ghJson(args) {
  const output = execFileSync("gh", args, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
}

function checkGhAvailable() {
  try {
    execFileSync("gh", ["auth", "status"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message.split("\n")[0] };
  }
}

function rollupStatus(pr) {
  const checks = pr.statusCheckRollup;
  if (!Array.isArray(checks) || checks.length === 0) {
    return "no-checks";
  }
  const states = checks.map((c) => c.conclusion ?? c.state ?? "UNKNOWN");
  if (
    states.some((s) => s === "FAILURE" || s === "ERROR" || s === "CANCELLED")
  ) {
    return "red";
  }
  if (
    states.some((s) => s === "PENDING" || s === "IN_PROGRESS" || s === "QUEUED")
  ) {
    return "pending";
  }
  if (
    states.every((s) => s === "SUCCESS" || s === "SKIPPED" || s === "NEUTRAL")
  ) {
    return "green";
  }
  return "unknown";
}

function ageFromNow(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = ms / 36e5;
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function section(title) {
  console.log("");
  console.log(`== ${title} ==`);
}

function printOwnerMergeQueue() {
  section("OWNER MERGE QUEUE");
  const prs = ghJson([
    "pr",
    "list",
    "--json",
    "number,title,isDraft,labels,statusCheckRollup",
    "--limit",
    "50",
  ]);

  if (prs.length === 0) {
    console.log("No open PRs.");
    return { prs: [] };
  }

  const rows = [];
  for (const pr of prs) {
    const status = rollupStatus(pr);
    const labelNames = (pr.labels ?? []).map((l) => l.name);
    const hasAutomergeSafe = labelNames.includes("automerge:safe");
    const draftFlag = pr.isDraft ? "draft" : "ready";
    const awaiting = !pr.isDraft && status === "green";
    const flag = awaiting ? " <- awaiting owner" : "";
    console.log(
      `PR #${pr.number} "${pr.title}" checks=${status} ${draftFlag} automerge:safe=${hasAutomergeSafe}${flag}`,
    );
    rows.push({
      number: pr.number,
      title: pr.title,
      status,
      isDraft: pr.isDraft,
      awaiting,
    });
  }
  return { prs: rows };
}

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

function printPipeline(manifest) {
  section("PIPELINE");
  console.log(`Epic #${manifest.epic}, owner @${manifest.owner}`);

  const entries = [];
  let markedCurrent = false;
  for (const entry of manifest.pipeline) {
    let state = "UNKNOWN";
    try {
      const issue = ghJson([
        "issue",
        "view",
        String(entry.issue),
        "--json",
        "number,state",
      ]);
      state = issue.state;
    } catch (err) {
      state = `ERROR(${err.message.split("\n")[0]})`;
    }

    const isOpen = state === "OPEN";
    const current = isOpen && !markedCurrent;
    if (current) markedCurrent = true;

    console.log(
      `#${entry.issue} state=${state} kick=${entry.kick}${current ? " <- current step" : ""}`,
    );
    entries.push({ ...entry, state, isOpen });
  }
  return { entries };
}

function printOwnerGates(manifest, pipelineEntries) {
  section("OWNER GATES");

  const gated = pipelineEntries.filter(
    (e) => e.isOpen && (e.kick === "pause" || e.kick === "none"),
  );

  let epics = [];
  try {
    epics = ghJson([
      "issue",
      "list",
      "--search",
      "EPIC: in:title",
      "--state",
      "open",
      "--json",
      "number,title,state",
    ]);
  } catch (err) {
    console.log(`Could not list open epics: ${err.message.split("\n")[0]}`);
  }

  if (gated.length === 0 && epics.length === 0) {
    console.log("None.");
    return { epics };
  }

  for (const entry of gated) {
    console.log(
      `Issue #${entry.issue} is human-gated (kick=${entry.kick}): ${entry.note ?? ""}`,
    );
  }
  for (const epic of epics) {
    console.log(`Epic #${epic.number} open: "${epic.title}"`);
  }
  return { epics };
}

function printMainHealth() {
  section("MAIN HEALTH");
  const runs = ghJson([
    "run",
    "list",
    "--branch",
    "main",
    "--limit",
    "8",
    "--json",
    "name,conclusion,createdAt,status",
  ]);

  if (runs.length === 0) {
    console.log("No recent runs on main.");
    return { runs: [] };
  }

  for (const run of runs) {
    const conclusion =
      run.status === "completed" ? (run.conclusion ?? "unknown") : run.status;
    const flag =
      run.status === "completed" &&
      conclusion !== "success" &&
      conclusion !== "skipped"
        ? " <- NON-SUCCESS"
        : "";
    console.log(
      `${run.name}: ${conclusion} (${ageFromNow(run.createdAt)} ago)${flag}`,
    );
  }
  return { runs };
}

function printSuggestedActions({
  prs,
  pipelineEntries,
  epics,
  runs,
  manifest,
}) {
  section("SUGGESTED NEXT ACTIONS");
  const actions = [];

  for (const pr of prs) {
    if (pr.awaiting) {
      actions.push(`merge PR #${pr.number} (green, non-draft)`);
    }
  }

  for (const epic of epics) {
    if (epic.number === manifest.epic) {
      const allClosed =
        pipelineEntries.length > 0 && pipelineEntries.every((e) => !e.isOpen);
      if (allClosed) {
        actions.push(`close epic #${epic.number} (all pipeline steps closed)`);
      }
    }
  }

  for (const run of runs) {
    const conclusion =
      run.status === "completed" ? (run.conclusion ?? "unknown") : run.status;
    if (
      run.status === "completed" &&
      conclusion !== "success" &&
      conclusion !== "skipped"
    ) {
      actions.push(`investigate red run "${run.name}"`);
    }
  }

  if (actions.length === 0) {
    console.log("none");
    return;
  }
  for (const action of actions) {
    console.log(`- ${action}`);
  }
}

function main() {
  const auth = checkGhAvailable();
  if (!auth.ok) {
    console.log(
      `status: gh CLI is not available or not authenticated (${auth.message})`,
    );
    return;
  }

  let manifest;
  try {
    manifest = loadManifest();
  } catch (err) {
    console.log(
      `status: could not read pipeline manifest: ${err.message.split("\n")[0]}`,
    );
    return;
  }

  let prs = [];
  try {
    ({ prs } = printOwnerMergeQueue());
  } catch (err) {
    console.log(`OWNER MERGE QUEUE: error: ${err.message.split("\n")[0]}`);
  }

  let pipelineEntries = [];
  try {
    ({ entries: pipelineEntries } = printPipeline(manifest));
  } catch (err) {
    console.log(`PIPELINE: error: ${err.message.split("\n")[0]}`);
  }

  let epics = [];
  try {
    ({ epics } = printOwnerGates(manifest, pipelineEntries));
  } catch (err) {
    console.log(`OWNER GATES: error: ${err.message.split("\n")[0]}`);
  }

  let runs = [];
  try {
    ({ runs } = printMainHealth());
  } catch (err) {
    console.log(`MAIN HEALTH: error: ${err.message.split("\n")[0]}`);
  }

  try {
    printSuggestedActions({ prs, pipelineEntries, epics, runs, manifest });
  } catch (err) {
    console.log(`SUGGESTED NEXT ACTIONS: error: ${err.message.split("\n")[0]}`);
  }

  console.log("");
}

try {
  main();
} catch (err) {
  console.log(`status: unexpected error: ${err.message ?? String(err)}`);
}

process.exit(0);
