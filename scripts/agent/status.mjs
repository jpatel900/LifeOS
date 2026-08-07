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
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// The HTML half lives in its own module (see its header for why). It is pure:
// this file does all the I/O and hands it the finished data shape. `escapeHtml`
// and `ageFromNow` are small shared pure helpers that live there to keep the
// dependency one-way; both are re-exported at the bottom of this file so the
// existing `./status.mjs` import path in status.test.mjs keeps working.
import {
  ageFromNow,
  escapeHtml,
  parseCampaigns,
  parseLatestProgramNote,
  parseSlices,
  renderStatusHtml,
} from "./status-html.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(__dirname, "pipeline-manifest.json");
const COHERENCE_REGISTRY_PATH = path.join(
  REPO_ROOT,
  "docs",
  "coherence-registry.json",
);

function formatCoherenceFeature(feature) {
  const fr = typeof feature?.fr === "string" ? feature.fr : "unknown-fr";
  const title = typeof feature?.title === "string" ? feature.title : "untitled";
  return `${fr} ${title}`;
}

function readCoherenceRegistry() {
  const raw = readFileSync(COHERENCE_REGISTRY_PATH, "utf8");
  return JSON.parse(raw);
}

function collectCoherenceStats(registry) {
  const features = Array.isArray(registry?.features) ? registry.features : [];
  const byFr = new Map(features.map((feature) => [feature.fr, feature]));
  const edges = features.flatMap((feature) =>
    Array.isArray(feature?.interacts_with)
      ? feature.interacts_with.map((edge) => ({ from: feature, edge }))
      : [],
  );
  const unresolved = edges.filter(
    ({ edge }) =>
      edge?.kind === "X" &&
      (typeof edge.resolution_ref !== "string" ||
        edge.resolution_ref.trim() === ""),
  );

  return {
    featureCount: features.length,
    edgeCount: edges.length,
    unresolvedPairs: unresolved.map(({ from, edge }) => ({
      from,
      to: byFr.get(edge.fr) ?? { fr: edge.fr, title: "unknown feature" },
    })),
  };
}

function printCoherenceStatus() {
  try {
    const stats = collectCoherenceStats(readCoherenceRegistry());
    const guards = stats.unresolvedPairs.length === 0 ? "ok" : "fail";
    console.log(
      `coherence: ${stats.featureCount} features, ${stats.edgeCount} edges, ${stats.unresolvedPairs.length} unresolved-X, guards ${guards}`,
    );
    for (const pair of stats.unresolvedPairs) {
      console.log(
        `  unresolved-X: ${formatCoherenceFeature(pair.from)} -> ${formatCoherenceFeature(pair.to)}`,
      );
    }
  } catch (err) {
    console.log(
      `coherence: warning: could not read docs/coherence-registry.json (${err.message.split("\n")[0]})`,
    );
  }
}

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

function section(title) {
  console.log("");
  console.log(`== ${title} ==`);
}

// Pure(-ish) data gather: shells out to `gh` but never prints. Shared by the
// text report (printOwnerMergeQueue) and the --html renderer so both read
// exactly the same PR shape.
function computeOpenPrs() {
  const prs = ghJson([
    "pr",
    "list",
    "--json",
    "number,title,author,isDraft,labels,statusCheckRollup,url",
    "--limit",
    "50",
  ]);

  return prs.map((pr) => {
    const status = rollupStatus(pr);
    const labelNames = (pr.labels ?? []).map((l) => l.name);
    return {
      number: pr.number,
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      status,
      isDraft: pr.isDraft,
      url: pr.url,
      labels: labelNames,
      hasAutomergeSafe: labelNames.includes("automerge:safe"),
      awaiting: !pr.isDraft && status === "green",
    };
  });
}

function printOwnerMergeQueue() {
  section("OWNER MERGE QUEUE");
  const rows = computeOpenPrs();

  if (rows.length === 0) {
    console.log("No open PRs.");
    return { prs: [] };
  }

  for (const pr of rows) {
    const draftFlag = pr.isDraft ? "draft" : "ready";
    const flag = pr.awaiting ? " <- awaiting owner" : "";
    console.log(
      `PR #${pr.number} "${pr.title}" checks=${pr.status} ${draftFlag} automerge:safe=${pr.hasAutomergeSafe}${flag}`,
    );
  }
  return { prs: rows };
}

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

function computePipelineEntries(manifest) {
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

    entries.push({ ...entry, state, isOpen, current });
  }
  return entries;
}

function printPipeline(manifest) {
  section("PIPELINE");
  console.log(`Epic #${manifest.epic}, owner @${manifest.owner}`);

  const entries = computePipelineEntries(manifest);
  for (const entry of entries) {
    console.log(
      `#${entry.issue} state=${entry.state} kick=${entry.kick}${entry.current ? " <- current step" : ""}`,
    );
  }
  return { entries };
}

function computeOpenEpics() {
  const openIssues = ghJson([
    "issue",
    "list",
    "--state",
    "open",
    "--json",
    "number,title,state",
    "--limit",
    "200",
  ]);
  return openIssues.filter((issue) => issue.title.startsWith("EPIC:"));
}

function printOwnerGates(manifest, pipelineEntries) {
  section("OWNER GATES");

  const gated = pipelineEntries.filter(
    (e) => e.isOpen && (e.kick === "pause" || e.kick === "none"),
  );

  let epics = [];
  try {
    epics = computeOpenEpics();
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

function computeMainHealthRuns() {
  return ghJson([
    "run",
    "list",
    "--branch",
    "main",
    "--limit",
    "8",
    "--json",
    "name,conclusion,createdAt,status",
  ]);
}

function printMainHealth() {
  section("MAIN HEALTH");
  const runs = computeMainHealthRuns();

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

// U2b: surface Migration Drift prominently in the owner queue. Prod migrations
// are manual (Vercel never pushes them), so a RED drift means prod is behind
// main. We can't reach prod from here, but we can name the run and the exact
// `pnpm drift:assemble` command that turns a merged migration into apply SQL.
function computeMigrationDrift() {
  const runs = ghJson([
    "run",
    "list",
    "--workflow",
    "migration-drift.yml",
    "--limit",
    "1",
    "--json",
    "conclusion,status,createdAt,databaseId",
  ]);

  if (runs.length === 0) {
    return { red: false, found: false };
  }

  const run = runs[0];
  const conclusion =
    run.status === "completed" ? (run.conclusion ?? "unknown") : run.status;
  const red =
    run.status === "completed" &&
    conclusion !== "success" &&
    conclusion !== "skipped";

  return {
    red,
    found: true,
    conclusion,
    age: ageFromNow(run.createdAt),
    databaseId: run.databaseId,
  };
}

function printMigrationDrift() {
  section("MIGRATION DRIFT");
  try {
    const drift = computeMigrationDrift();

    if (!drift.found) {
      console.log("No Migration Drift runs found.");
      return { red: false };
    }

    console.log(
      `Migration Drift: ${drift.red ? "RED" : drift.conclusion} (${drift.age} ago, run ${drift.databaseId})`,
    );

    if (drift.red) {
      console.log(
        "  Prod is behind main. The failing run names the missing versions; generate apply SQL:",
      );
      console.log(
        "    pnpm drift:assemble supabase/migrations/<version>_<name>.sql [...] --date=$(date +%F)",
      );
      console.log(
        "  Run the output in the Supabase SQL Editor, then re-run Migration Drift until green.",
      );
    }

    return { red: drift.red };
  } catch (err) {
    console.log(
      `Migration Drift: could not read run status (${err.message.split("\n")[0]})`,
    );
    return { red: false };
  }
}

// ---------------------------------------------------------------------------
// OWNER-GATE / AGENT-TODO mechanical triage collector (AGENTS.md rule 11).
//
// Agent-authored PRs/issues leave follow-up items as checkbox lines tagged
// `OWNER-GATE:` or `AGENT-TODO:`. This scans open issues, open PRs, and the
// last 20 merged PRs for unchecked (`- [ ]`) lines carrying either marker
// (checked `[x]` boxes are excluded -- they're resolved), plus a labelled
// "untagged (legacy)" heuristic for older bodies written before the
// convention existed (any unchecked line containing the word "Owner").
// ---------------------------------------------------------------------------

// Pure: parses one issue/PR body into tagged gate items. No I/O.
function extractCheckboxGateItems(body, source) {
  if (typeof body !== "string" || body.length === 0) {
    return [];
  }
  const items = [];
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*-\s*\[ \]\s*(.+)$/);
    if (!match) continue;
    const text = match[1].trim();
    let kind = null;
    if (/OWNER-GATE:/.test(text)) {
      kind = "owner-gate";
    } else if (/AGENT-TODO:/.test(text)) {
      kind = "agent-todo";
    } else if (/\bowner\b/i.test(text)) {
      kind = "legacy-owner";
    }
    if (kind) {
      items.push({ text, kind, source });
    }
  }
  return items;
}

// Gather step: shells out to `gh` for the three body sources. Each source is
// wrapped independently so one failing call (e.g. rate limit) still leaves
// the other two usable -- degrades gracefully rather than dropping everything.
function computeGateItems() {
  const items = [];
  const errors = [];

  // Each source carries its own `state` and a timestamp. The state is not
  // guessed -- it is implied by the query that produced the row (the open-issue
  // and open-PR lists can only return OPEN rows; the merged list can only
  // return merged ones), so this costs zero extra `gh` calls. The HTML work map
  // uses it to demote items whose source has since closed into a separate
  // "possibly stale" group instead of leaving a dead ask in the live queue
  // forever. Nothing is dropped, and the text report ignores these fields.
  try {
    const issues = ghJson([
      "issue",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,body,url,updatedAt",
      "--limit",
      "200",
    ]);
    for (const issue of issues) {
      items.push(
        ...extractCheckboxGateItems(issue.body, {
          type: "issue",
          number: issue.number,
          title: issue.title,
          url: issue.url,
          state: "open",
          at: issue.updatedAt ?? null,
        }),
      );
    }
  } catch (err) {
    errors.push(`open issues: ${err.message.split("\n")[0]}`);
  }

  try {
    const openPrs = ghJson([
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,body,url,updatedAt",
      "--limit",
      "50",
    ]);
    for (const pr of openPrs) {
      items.push(
        ...extractCheckboxGateItems(pr.body, {
          type: "pr",
          number: pr.number,
          title: pr.title,
          url: pr.url,
          state: "open",
          at: pr.updatedAt ?? null,
        }),
      );
    }
  } catch (err) {
    errors.push(`open PRs: ${err.message.split("\n")[0]}`);
  }

  try {
    const mergedPrs = ghJson([
      "pr",
      "list",
      "--state",
      "merged",
      "--limit",
      "20",
      "--json",
      "number,title,body,url,mergedAt",
    ]);
    for (const pr of mergedPrs) {
      items.push(
        ...extractCheckboxGateItems(pr.body, {
          type: "pr",
          number: pr.number,
          title: pr.title,
          url: pr.url,
          state: "merged",
          at: pr.mergedAt ?? null,
        }),
      );
    }
  } catch (err) {
    errors.push(`merged PRs (last 20): ${err.message.split("\n")[0]}`);
  }

  return { items, errors };
}

// Pure: strips the marker, labels legacy-untagged items, and derives the
// source PR/issue link. Shared by text and HTML rendering.
function formatGateItem(item) {
  const cleaned = item.text
    .replace(/^(OWNER-GATE:|AGENT-TODO:)\s*/i, "")
    .trim();
  const refLabel = `${item.source.type === "issue" ? "Issue" : "PR"} #${item.source.number}`;
  const prefix = item.kind === "legacy-owner" ? "untagged (legacy): " : "";
  // sourceState / sourceAge are ADDITIVE. The text report reads only `text`
  // and `refLabel` (see main()), so adding fields here cannot change it; the
  // HTML work map uses them to demote and to date each item.
  return {
    text: `${prefix}${cleaned}`,
    refLabel,
    url: item.source.url,
    sourceState: item.source.state ?? null,
    sourceAge: item.source.at ? ageFromNow(item.source.at) : null,
  };
}

// Pure: splits already-extracted gate items into the owner queue (OWNER-GATE
// + legacy-untagged) and the agent pickup queue (AGENT-TODO). No I/O.
function buildGateQueues(items) {
  const ownerItems = items
    .filter(
      (item) => item.kind === "owner-gate" || item.kind === "legacy-owner",
    )
    .map(formatGateItem);
  const agentItems = items
    .filter((item) => item.kind === "agent-todo")
    .map(formatGateItem);
  return { ownerItems, agentItems };
}

function printAgentPickupQueue(items, errors = []) {
  section("AGENT PICKUP QUEUE");
  if (errors.length > 0) {
    console.log(`gate item scan degraded: ${errors.join("; ")}`);
  }
  if (items.length === 0) {
    console.log("none");
    return;
  }
  for (const item of items) {
    console.log(`- ${item.text} (${item.refLabel})`);
  }
}

// Pure: builds the "what does the owner need to click next" list from
// already-gathered data. No I/O -- unit-testable with fixtures.
function buildSuggestedActions({
  prs,
  pipelineEntries,
  epics,
  runs,
  manifest,
  driftRed,
}) {
  const actions = [];

  if (driftRed) {
    actions.push(
      "apply pending prod migrations (Migration Drift RED): pnpm drift:assemble <files> -> Supabase SQL Editor -> re-run Migration Drift",
    );
  }

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

  return actions;
}

function printSuggestedActions(args, gateQueueLines = []) {
  section("SUGGESTED NEXT ACTIONS");
  const actions = [...buildSuggestedActions(args), ...gateQueueLines];

  if (actions.length === 0) {
    console.log("none");
    return;
  }
  for (const action of actions) {
    console.log(`- ${action}`);
  }
}

// ---------------------------------------------------------------------------
// --html mode: generated one-page work map
//
// Two halves, kept deliberately separate:
//   - gatherHtmlStatusData(): all I/O (gh CLI, git, filesystem). Never throws;
//     every failure becomes an `error` field so the page always renders.
//   - renderStatusHtml(data): pure string-building from that data shape. No
//     I/O, so it's unit-testable with fixtures (see status.test.mjs).
// ---------------------------------------------------------------------------

const KEY_WORKFLOWS = [
  { file: "migration-drift.yml", label: "Migration Drift" },
  { file: "migration-apply.yml", label: "Migration Apply" },
  { file: "weekly-prod-smoke.yml", label: "Weekly prod smoke" },
  { file: "provider-canary.yml", label: "Provider canary" },
];

function computeWorkflowHealth(file, label) {
  try {
    const runs = ghJson([
      "run",
      "list",
      "--workflow",
      file,
      "--limit",
      "1",
      "--json",
      "name,conclusion,status,createdAt,databaseId,url",
    ]);
    if (runs.length === 0) {
      return { file, label, found: false };
    }
    const run = runs[0];
    const conclusion =
      run.status === "completed" ? (run.conclusion ?? "unknown") : run.status;
    const healthy =
      run.status === "completed" &&
      (conclusion === "success" || conclusion === "skipped");
    return {
      file,
      label,
      found: true,
      conclusion,
      healthy,
      age: ageFromNow(run.createdAt),
      url: run.url,
      databaseId: run.databaseId,
    };
  } catch (err) {
    return { file, label, found: false, error: err.message.split("\n")[0] };
  }
}

// Local-only, no network: compares HEAD against the origin/main ref already
// on disk. Never runs `git fetch` (this script stays read-only / side-effect
// free, matching the header contract above).
function gatherMainFreshness() {
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    const headSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
    const headDate = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "HEAD"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    ).trim();

    let originSha = null;
    let originDate = null;
    let aheadOfOrigin = null;
    try {
      originSha = execFileSync("git", ["rev-parse", "--short", "origin/main"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      }).trim();
      originDate = execFileSync(
        "git",
        ["log", "-1", "--format=%cI", "origin/main"],
        { cwd: REPO_ROOT, encoding: "utf8" },
      ).trim();
      const aheadCount = execFileSync(
        "git",
        ["rev-list", "--count", "origin/main..HEAD"],
        { cwd: REPO_ROOT, encoding: "utf8" },
      ).trim();
      aheadOfOrigin = Number.parseInt(aheadCount, 10);
    } catch {
      // origin/main ref not present locally (e.g. shallow clone) -- degrade
      // to HEAD-only info below.
    }

    return { branch, headSha, headDate, originSha, originDate, aheadOfOrigin };
  } catch (err) {
    return { error: err.message.split("\n")[0] };
  }
}

function mapIssueForHtml(issue) {
  return {
    number: issue.number,
    title: issue.title,
    labels: (issue.labels ?? []).map((l) => l.name),
    url: issue.url,
  };
}

// Full-map view: every issue (open + closed), used for the filterable
// "whole body of work" tab. Separate from mapIssueForHtml (open-only, used by
// the "Now" owner-queue lanes) because the full map needs state/closedAt too.
function mapAllIssueForHtml(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: (issue.labels ?? []).map((l) => l.name),
    url: issue.url,
    createdAt: issue.createdAt ?? null,
    closedAt: issue.closedAt ?? null,
  };
}

function computeAllIssues() {
  const issues = ghJson([
    "issue",
    "list",
    "--state",
    "all",
    "--json",
    "number,title,state,labels,closedAt,createdAt,url",
    "--limit",
    "300",
  ]);
  return issues.map(mapAllIssueForHtml);
}

// Full-map "Plans & ideas" section: git-tracked .md files in the planning /
// vision docs dirs, plus their first "STATUS:" line if they carry one
// (several completed plans are headed "STATUS: COMPLETE -- ..."). Pure
// filesystem + git ls-files -- no `gh` dependency, so this still works when
// GitHub is unreachable.
const PLAN_DOC_DIRS = ["docs/implementation-planning", "docs/vision"];

function gatherPlansAndIdeas() {
  const items = [];
  for (const dir of PLAN_DOC_DIRS) {
    let relPaths = [];
    try {
      const output = execFileSync("git", ["ls-files", dir], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      });
      relPaths = output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.endsWith(".md"));
    } catch (err) {
      items.push({ path: dir, error: err.message.split("\n")[0] });
      continue;
    }

    for (const relPath of relPaths) {
      let status = null;
      try {
        const content = readFileSync(path.join(REPO_ROOT, relPath), "utf8");
        const firstLine = (content.split("\n")[0] ?? "").trim();
        if (firstLine.startsWith("STATUS:")) {
          status = firstLine.slice("STATUS:".length).trim();
        }
      } catch {
        // File listed by git but unreadable (rare); still list the path with
        // no status rather than dropping it.
      }
      items.push({
        path: relPath,
        status,
        complete: status != null && /complete/i.test(status),
        url: `https://github.com/jpatel900/LifeOS/blob/main/${relPath}`,
      });
    }
  }
  return items;
}

// Program state for the campaign strip.
//
// Campaign and slice state come from docs/program/campaigns.json and NOTHING
// else (owner decision 2026-08-06, PR #848 gate b). Before that file existed
// this parsed prose out of final-ux-loop.md section 4, because the repo had no
// machine-readable campaign source at all -- no milestones, no labels, no
// manifest. Parsing prose meant the strip drifted whenever the wording moved.
//
// The prose doc still supplies the human narrative, and the newest dated
// bullet from its section 6 is still read as the "latest program note". The
// two are kept honest by a self-test that fails when campaigns.json and
// section 4 disagree on ids, names, or states -- so drift is a red build
// rather than a quietly wrong map.
const CAMPAIGNS_JSON = path.join("docs", "program", "campaigns.json");
const PROGRAM_DOC = path.join("docs", "program", "final-ux-loop.md");

function docLastChangedAge(relPath) {
  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", relPath],
      { cwd: REPO_ROOT, encoding: "utf8" },
    ).trim();
    return iso ? ageFromNow(iso) : null;
  } catch {
    return null;
  }
}

function gatherProgram() {
  const posix = (p) => p.split(path.sep).join("/");
  let program;
  try {
    const raw = JSON.parse(
      readFileSync(path.join(REPO_ROOT, CAMPAIGNS_JSON), "utf8"),
    );
    const campaigns = Array.isArray(raw.campaigns) ? raw.campaigns : [];
    program = {
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        state: c.state,
        detail: c.summary ?? "",
        note: c.note ?? null,
        closedOn: c.closed_on ?? null,
        score: c.score ?? null,
      })),
      campaignsPath: posix(CAMPAIGNS_JSON),
      campaignsAge: docLastChangedAge(CAMPAIGNS_JSON),
      slices: [],
      slicesPath: null,
      slicesAge: null,
      slicesCampaign: null,
      latestNote: null,
      error:
        campaigns.length === 0
          ? `no campaigns listed in ${posix(CAMPAIGNS_JSON)}`
          : null,
    };

    // Slices for the in-flight campaign, states included -- they are now
    // authoritative, which is the whole point of the JSON.
    const current = campaigns.find((c) => c.state === "in-flight");
    if (current && Array.isArray(current.slices)) {
      program.slices = current.slices.map((s) => ({
        id: s.id,
        name: s.name,
        state: s.state,
        ref: s.ref ?? null,
      }));
      program.slicesPath = posix(CAMPAIGNS_JSON);
      program.slicesAge = program.campaignsAge;
      program.slicesCampaign = `${current.id} ${current.name}`;
    }
  } catch (err) {
    return { campaigns: [], error: err.message.split("\n")[0] };
  }

  // The prose doc still owns the running narrative. Its absence is not fatal:
  // the strip renders from JSON either way.
  try {
    const markdown = readFileSync(path.join(REPO_ROOT, PROGRAM_DOC), "utf8");
    program.latestNote = parseLatestProgramNote(markdown);
    program.notePath = posix(PROGRAM_DOC);
    program.noteAge = docLastChangedAge(PROGRAM_DOC);
  } catch (err) {
    program.noteError = err.message.split("\n")[0];
  }

  return program;
}

// Local read of the coherence registry -- the same signal printCoherenceStatus
// puts at the top of the text report, reshaped for the health strip's
// "are the guards quiet?" cell.
function gatherCoherence() {
  try {
    const stats = collectCoherenceStats(readCoherenceRegistry());
    return {
      featureCount: stats.featureCount,
      edgeCount: stats.edgeCount,
      unresolvedCount: stats.unresolvedPairs.length,
      error: null,
    };
  } catch (err) {
    return { error: err.message.split("\n")[0] };
  }
}

function gatherHtmlStatusData() {
  const generatedAt = new Date().toISOString();
  const data = {
    generatedAt,
    ghAvailable: true,
    ghError: null,
    ownerQueue: [],
    prs: [],
    prsError: null,
    lanes: { mode: "open", groups: {} },
    issuesError: null,
    workflows: [],
    mainFreshness: gatherMainFreshness(),
    allIssues: [],
    allIssuesError: null,
    plans: [],
    plansError: null,
    agentPickupQueue: [],
    gateItemsError: null,
    // Signals the page reports on directly. Each carries its own error field
    // so a failure is shown as "could not read X: <reason>" rather than
    // silently omitted -- three of these used to be swallowed by bare catches.
    coherence: gatherCoherence(),
    program: gatherProgram(),
    mainHealth: { runs: [], error: null },
    drift: null,
    epicsError: null,
    pipelineError: null,
  };

  // Filesystem-only; doesn't need `gh`, so gather it before the auth gate.
  try {
    data.plans = gatherPlansAndIdeas();
  } catch (err) {
    data.plansError = err.message.split("\n")[0];
  }

  const auth = checkGhAvailable();
  if (!auth.ok) {
    data.ghAvailable = false;
    data.ghError = auth.message;
    data.allIssuesError = auth.message;
    data.ownerQueue.push(
      "GitHub data unavailable -- owner queue could not be computed.",
    );
    return data;
  }

  let manifest = null;
  try {
    manifest = loadManifest();
  } catch (err) {
    data.ghError = `pipeline manifest: ${err.message.split("\n")[0]}`;
  }

  try {
    data.prs = computeOpenPrs();
  } catch (err) {
    data.prsError = err.message.split("\n")[0];
  }

  let issues = [];
  try {
    issues = ghJson([
      "issue",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,labels,url",
      "--limit",
      "200",
    ]);
  } catch (err) {
    data.issuesError = err.message.split("\n")[0];
  }

  const usability = issues.filter((issue) =>
    (issue.labels ?? []).some((l) => /usability/i.test(l.name)),
  );
  const enjoyability = issues.filter((issue) =>
    (issue.labels ?? []).some((l) => /enjoyability/i.test(l.name)),
  );
  if (usability.length > 0 || enjoyability.length > 0) {
    data.lanes.mode = "usability-enjoyability";
    data.lanes.groups.usability = usability.map(mapIssueForHtml);
    data.lanes.groups.enjoyability = enjoyability.map(mapIssueForHtml);
  } else {
    data.lanes.mode = "open";
    data.lanes.groups.open = issues.map(mapIssueForHtml);
  }

  try {
    data.allIssues = computeAllIssues();
  } catch (err) {
    data.allIssuesError = err.message.split("\n")[0];
  }

  try {
    const { items, errors } = computeGateItems();
    const { ownerItems, agentItems } = buildGateQueues(items);
    data.ownerQueue.push(...ownerItems);
    data.agentPickupQueue = agentItems;
    if (errors.length > 0) {
      data.gateItemsError = errors.join("; ");
    }
  } catch (err) {
    data.gateItemsError = err.message.split("\n")[0];
  }

  data.workflows = KEY_WORKFLOWS.map(({ file, label }) =>
    computeWorkflowHealth(file, label),
  );

  if (manifest) {
    let pipelineEntries = [];
    let epics = [];
    let runs = [];
    let driftRed = false;
    try {
      pipelineEntries = computePipelineEntries(manifest);
    } catch (err) {
      data.pipelineError = err.message.split("\n")[0];
    }
    try {
      epics = computeOpenEpics();
    } catch (err) {
      data.epicsError = err.message.split("\n")[0];
    }
    try {
      runs = computeMainHealthRuns();
      data.mainHealth = { runs, error: null };
    } catch (err) {
      data.mainHealth = { runs: [], error: err.message.split("\n")[0] };
    }
    try {
      const drift = computeMigrationDrift();
      data.drift = { ...drift, error: null };
      driftRed = drift.red;
    } catch (err) {
      data.drift = {
        found: false,
        red: false,
        error: err.message.split("\n")[0],
      };
    }

    data.ownerQueue.push(
      ...buildSuggestedActions({
        prs: data.prs,
        pipelineEntries,
        epics,
        runs,
        manifest,
        driftRed,
      }),
    );
  }

  return data;
}

function main() {
  printCoherenceStatus();

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

  let driftRed = false;
  try {
    ({ red: driftRed } = printMigrationDrift());
  } catch (err) {
    console.log(`MIGRATION DRIFT: error: ${err.message.split("\n")[0]}`);
  }

  let ownerGateItems = [];
  let agentPickupItems = [];
  let gateErrors = [];
  try {
    const { items, errors } = computeGateItems();
    gateErrors = errors;
    ({ ownerItems: ownerGateItems, agentItems: agentPickupItems } =
      buildGateQueues(items));
  } catch (err) {
    gateErrors = [err.message.split("\n")[0]];
  }

  try {
    printSuggestedActions(
      {
        prs,
        pipelineEntries,
        epics,
        runs,
        manifest,
        driftRed,
      },
      ownerGateItems.map((item) => `${item.text} (${item.refLabel})`),
    );
  } catch (err) {
    console.log(`SUGGESTED NEXT ACTIONS: error: ${err.message.split("\n")[0]}`);
  }

  try {
    printAgentPickupQueue(agentPickupItems, gateErrors);
  } catch (err) {
    console.log(`AGENT PICKUP QUEUE: error: ${err.message.split("\n")[0]}`);
  }

  console.log("");
}

function parseArgs(argv) {
  const html = argv.includes("--html");
  const outIndex = argv.indexOf("--out");
  const out = outIndex !== -1 && argv[outIndex + 1] ? argv[outIndex + 1] : null;
  return { html, out };
}

function runHtmlMode(argv) {
  const { out } = parseArgs(argv);
  const outPath = out
    ? path.resolve(process.cwd(), out)
    : path.resolve(process.cwd(), "lifeos-status.html");

  const data = gatherHtmlStatusData();
  const html = renderStatusHtml(data);
  writeFileSync(outPath, html, "utf8");
  console.log(`status --html: wrote ${outPath}`);
}

function run() {
  const argv = process.argv.slice(2);
  const { html } = parseArgs(argv);

  if (html) {
    try {
      runHtmlMode(argv);
    } catch (err) {
      console.log(
        `status --html: unexpected error: ${err.message ?? String(err)}`,
      );
    }
    return;
  }

  try {
    main();
  } catch (err) {
    console.log(`status: unexpected error: ${err.message ?? String(err)}`);
  }
}

// Only run when executed directly (`node status.mjs` / `pnpm status`), not
// when imported by status.test.mjs -- importing must never shell out to gh
// or touch the filesystem as a side effect.
const isDirectRun =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  run();
  process.exit(0);
}

export {
  rollupStatus,
  ageFromNow,
  buildSuggestedActions,
  computeOpenPrs,
  computePipelineEntries,
  computeOpenEpics,
  computeMainHealthRuns,
  computeMigrationDrift,
  computeWorkflowHealth,
  computeAllIssues,
  gatherMainFreshness,
  gatherPlansAndIdeas,
  gatherHtmlStatusData,
  renderStatusHtml,
  escapeHtml,
  parseArgs,
  extractCheckboxGateItems,
  buildGateQueues,
  formatGateItem,
};
