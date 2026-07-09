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
// OWNER-GATE / AGENT-TODO mechanical triage collector (AGENTS.md rule 15).
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

  try {
    const issues = ghJson([
      "issue",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,body,url",
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
      "number,title,body,url",
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
      "number,title,body,url",
    ]);
    for (const pr of mergedPrs) {
      items.push(
        ...extractCheckboxGateItems(pr.body, {
          type: "pr",
          number: pr.number,
          title: pr.title,
          url: pr.url,
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
  return { text: `${prefix}${cleaned}`, refLabel, url: item.source.url };
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
      data.ownerQueue.push(`pipeline: ${err.message.split("\n")[0]}`);
    }
    try {
      epics = computeOpenEpics();
    } catch {
      // already reflected via issuesError-style failures elsewhere; owner
      // queue simply won't include an epic-close suggestion.
    }
    try {
      runs = computeMainHealthRuns();
    } catch {
      // main health unavailable -- suggested actions below just won't flag
      // a red run; the workflow health row still reports Migration Drift etc.
    }
    try {
      ({ red: driftRed } = computeMigrationDrift());
    } catch {
      // drift status unknown; omitted from owner queue rather than guessed.
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ciBadge(status) {
  const cls =
    status === "green"
      ? "badge badge-green"
      : status === "red"
        ? "badge badge-red"
        : status === "pending"
          ? "badge badge-pending"
          : "badge badge-unknown";
  return `<span class="${cls}">${escapeHtml(status)}</span>`;
}

function renderIssueCards(issues) {
  if (!issues || issues.length === 0) {
    return '<p class="dim">Nothing open here.</p>';
  }
  return issues
    .map(
      (issue) => `<div class="card">
        <b><a href="${escapeHtml(issue.url ?? "#")}">#${issue.number}</a> ${escapeHtml(issue.title)}</b>
        <span>${issue.labels.map(escapeHtml).join(", ") || "no labels"}</span>
      </div>`,
    )
    .join("\n");
}

function issueStateBadge(state) {
  return state === "OPEN"
    ? '<span class="badge badge-open">open</span>'
    : '<span class="badge badge-closed">closed</span>';
}

// Full-map view: every issue (open + closed) as a filterable row. Each row
// carries data-state / data-labels / data-title attributes that the inline
// client-side filter script reads -- no re-render, no framework.
function renderFullIssueRows(issues) {
  if (!issues || issues.length === 0) {
    return '<p class="dim">No issues found.</p>';
  }
  return issues
    .map((issue) => {
      const stateLower = issue.state === "OPEN" ? "open" : "closed";
      const labels = issue.labels ?? [];
      const meta =
        stateLower === "open"
          ? issue.createdAt
            ? `opened ${ageFromNow(issue.createdAt)} ago`
            : ""
          : issue.closedAt
            ? `closed ${ageFromNow(issue.closedAt)} ago`
            : "";
      return `<div class="issue-row${stateLower === "closed" ? " issue-closed" : ""}" data-state="${stateLower}" data-labels="${escapeHtml(labels.join(","))}" data-title="${escapeHtml(issue.title.toLowerCase())}">
        <b><a href="${escapeHtml(issue.url ?? "#")}">#${issue.number}</a> ${escapeHtml(issue.title)}</b>
        ${issueStateBadge(issue.state)}
        <span class="dim">${labels.map(escapeHtml).join(", ") || "no labels"}${meta ? ` &middot; ${escapeHtml(meta)}` : ""}</span>
      </div>`;
    })
    .join("\n");
}

function collectLabelSet(issues) {
  const set = new Set();
  for (const issue of issues ?? []) {
    for (const label of issue.labels ?? []) {
      set.add(label);
    }
  }
  return [...set].sort();
}

function renderLabelChips(labels) {
  if (labels.length === 0) return "";
  return labels
    .map(
      (label) =>
        `<button type="button" class="chip label-chip" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`,
    )
    .join("\n");
}

function renderPlansList(plans) {
  if (!plans || plans.length === 0) {
    return '<p class="dim">No plans found.</p>';
  }
  return plans
    .map((plan) => {
      if (plan.error) {
        return `<div class="plan-row dim">${escapeHtml(plan.path)}: ${escapeHtml(plan.error)}</div>`;
      }
      const cls = plan.complete ? "plan-row plan-complete" : "plan-row";
      return `<div class="${cls}">
        <b><a href="${escapeHtml(plan.url)}">${escapeHtml(plan.path)}</a></b>
        ${plan.status ? `<span class="dim">${escapeHtml(plan.status)}</span>` : '<span class="dim">no STATUS line</span>'}
      </div>`;
    })
    .join("\n");
}

// Pure: string-building only, no I/O. Takes the shape produced by
// gatherHtmlStatusData() (or an equivalent fixture in tests).
function renderStatusHtml(data) {
  const generatedLabel = escapeHtml(data.generatedAt);

  const ghUnavailableSection = !data.ghAvailable
    ? `<div class="zone warn">
        <h2>GitHub data unavailable</h2>
        <p>${escapeHtml(data.ghError ?? "unknown reason")}</p>
        <p class="dim">Re-run once <code>gh auth status</code> succeeds to get live PRs, issues, and workflow health.</p>
      </div>`
    : "";

  // ownerQueue holds two shapes: plain strings from buildSuggestedActions
  // (merge/close/investigate actions) and gate-item objects from
  // buildGateQueues ({ text, refLabel, url }) that carry a linked source.
  const renderOwnerQueueItem = (item) => {
    if (typeof item === "string") {
      return `<li>${escapeHtml(item)}</li>`;
    }
    const link = item.refLabel
      ? ` &mdash; <a href="${escapeHtml(item.url ?? "#")}">${escapeHtml(item.refLabel)}</a>`
      : "";
    return `<li>${escapeHtml(item.text)}${link}</li>`;
  };

  const ownerQueueItems =
    data.ownerQueue.length === 0
      ? "<li>Nothing waiting on you right now.</li>"
      : data.ownerQueue.map(renderOwnerQueueItem).join("\n");

  const agentPickupQueue = data.agentPickupQueue ?? [];
  const agentPickupItems =
    agentPickupQueue.length === 0
      ? '<li class="dim">Nothing pre-classified as agent-doable right now.</li>'
      : agentPickupQueue
          .map((item) => {
            const link = item.refLabel
              ? ` &mdash; <a href="${escapeHtml(item.url ?? "#")}">${escapeHtml(item.refLabel)}</a>`
              : "";
            return `<li>${escapeHtml(item.text)}${link}</li>`;
          })
          .join("\n");
  const agentPickupErrorHtml =
    data.gateItemsError != null
      ? `<p class="dim">Gate item scan degraded: ${escapeHtml(data.gateItemsError)}</p>`
      : "";

  const prRows =
    data.prsError != null
      ? `<tr><td colspan="5" class="dim">PR data unavailable: ${escapeHtml(data.prsError)}</td></tr>`
      : data.prs.length === 0
        ? '<tr><td colspan="5" class="dim">No open PRs.</td></tr>'
        : data.prs
            .map(
              (pr) => `<tr>
                <td><a href="${escapeHtml(pr.url ?? "#")}">#${pr.number}</a></td>
                <td>${escapeHtml(pr.title)}</td>
                <td>${escapeHtml(pr.author)}</td>
                <td>${ciBadge(pr.status)}</td>
                <td>${pr.isDraft ? "draft" : "ready"}${pr.awaiting ? " &larr; awaiting owner" : ""}</td>
              </tr>`,
            )
            .join("\n");

  const workflowRows =
    data.workflows.length === 0
      ? '<p class="dim">No workflow data.</p>'
      : data.workflows
          .map((wf) => {
            if (wf.error) {
              return `<div class="wf-item"><b>${escapeHtml(wf.label)}</b><span class="badge badge-unknown">error</span><span class="dim">${escapeHtml(wf.error)}</span></div>`;
            }
            if (!wf.found) {
              return `<div class="wf-item"><b>${escapeHtml(wf.label)}</b><span class="badge badge-unknown">no runs</span></div>`;
            }
            return `<div class="wf-item"><b>${escapeHtml(wf.label)}</b><span class="${wf.healthy ? "badge badge-green" : "badge badge-red"}">${escapeHtml(wf.conclusion)}</span><span class="dim">${escapeHtml(wf.age)} ago</span></div>`;
          })
          .join("\n");

  const lanesHtml =
    data.lanes.mode === "usability-enjoyability"
      ? `<div class="zone">
          <h2><span class="dot dot-usability"></span> Usability</h2>
          ${renderIssueCards(data.lanes.groups.usability)}
        </div>
        <div class="zone">
          <h2><span class="dot dot-enjoyability"></span> Enjoyability</h2>
          ${renderIssueCards(data.lanes.groups.enjoyability)}
        </div>`
      : `<div class="zone" style="grid-column: 1 / -1;">
          <h2><span class="dot dot-open"></span> Open work</h2>
          ${data.issuesError != null ? `<p class="dim">Issue data unavailable: ${escapeHtml(data.issuesError)}</p>` : renderIssueCards(data.lanes.groups.open)}
        </div>`;

  const freshness = data.mainFreshness ?? {};
  const freshnessHtml = freshness.error
    ? `<p class="dim">Freshness unavailable: ${escapeHtml(freshness.error)}</p>`
    : `<p>Local <code>${escapeHtml(freshness.branch ?? "?")}</code> @ ${escapeHtml(freshness.headSha ?? "?")} (${escapeHtml(freshness.headDate ?? "?")})${
        freshness.originSha
          ? ` vs <code>origin/main</code> @ ${escapeHtml(freshness.originSha)} (${escapeHtml(freshness.originDate ?? "?")})${
              typeof freshness.aheadOfOrigin === "number"
                ? freshness.aheadOfOrigin === 0
                  ? " -- up to date"
                  : ` -- ${freshness.aheadOfOrigin} commit(s) ahead of origin/main`
                : ""
            }`
          : " (origin/main ref not available locally)"
      }</p>`;

  const allIssues = data.allIssues ?? [];
  const openCount = allIssues.filter((i) => i.state === "OPEN").length;
  const closedCount = allIssues.filter((i) => i.state !== "OPEN").length;
  const labelSet = collectLabelSet(allIssues);

  const fullMapIssuesHtml =
    data.allIssuesError != null
      ? `<p class="dim">Issue data unavailable: ${escapeHtml(data.allIssuesError)}</p>`
      : `<div class="filter-bar">
          <div class="chip-row">
            <button type="button" class="chip status-chip active" data-status="open">Open</button>
            <button type="button" class="chip status-chip" data-status="closed">Closed</button>
            <button type="button" class="chip status-chip" data-status="all">All</button>
          </div>
          <div class="chip-row">${renderLabelChips(labelSet)}</div>
          <input type="text" id="issueSearch" class="text-filter" placeholder="Filter by title..." />
        </div>
        <div id="issuesList">
          ${renderFullIssueRows(allIssues)}
        </div>`;

  const fullMapHtml = `<section>
      <h2 class="section-title">All issues (${openCount} open / ${closedCount} closed)</h2>
      ${fullMapIssuesHtml}
    </section>

    <section>
      <h2 class="section-title">Plans &amp; ideas</h2>
      ${data.plansError != null ? `<p class="dim">Plans data unavailable: ${escapeHtml(data.plansError)}</p>` : renderPlansList(data.plans)}
    </section>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LifeOS Work Map</title>
    <style>
      :root {
        --bg: #0e1117;
        --panel: #161b24;
        --line: #2a3140;
        --text: #dde3ec;
        --dim: #8b93a5;
        --green: #4ade80;
        --red: #f87171;
        --amber: #f59e0b;
        --usability: #60a5fa;
        --enjoyability: #c084fc;
        --open: #f472b6;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font: 14px/1.5 "Segoe UI", system-ui, sans-serif;
        padding: 28px;
      }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .sub { color: var(--dim); margin-bottom: 20px; font-size: 13px; }
      .owner-queue {
        border: 2px solid var(--amber);
        border-radius: 12px;
        background: rgba(245, 158, 11, 0.08);
        padding: 16px 18px;
        margin-bottom: 20px;
        max-width: 1100px;
      }
      .owner-queue h2 {
        margin: 0 0 10px;
        font-size: 14px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .owner-queue ul { margin: 0; padding-left: 20px; }
      .owner-queue li { margin: 4px 0; }
      .agent-queue {
        border: 2px solid var(--usability);
        border-radius: 12px;
        background: rgba(96, 165, 250, 0.08);
        padding: 16px 18px;
        margin-bottom: 20px;
        max-width: 1100px;
      }
      .agent-queue h2 {
        margin: 0 0 10px;
        font-size: 14px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .agent-queue ul { margin: 0; padding-left: 20px; }
      .agent-queue li { margin: 4px 0; }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        max-width: 1100px;
        margin-bottom: 20px;
      }
      .zone {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 16px 18px;
      }
      .zone.warn { border-color: var(--red); background: rgba(248, 113, 113, 0.08); }
      .zone h2 {
        font-size: 13px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin: 0 0 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
      .dot-usability { background: var(--usability); }
      .dot-enjoyability { background: var(--enjoyability); }
      .dot-open { background: var(--open); }
      .card {
        border-left: 3px solid var(--line);
        padding: 6px 12px;
        margin: 8px 0;
        border-radius: 0 8px 8px 0;
        background: rgba(255, 255, 255, 0.02);
      }
      .card b { display: block; font-size: 14px; }
      .card b a { color: var(--text); }
      .card span { color: var(--dim); font-size: 12px; }
      table {
        width: 100%;
        max-width: 1100px;
        border-collapse: collapse;
        margin-bottom: 20px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
        overflow: hidden;
      }
      th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 13px; }
      th { color: var(--dim); font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
      tr:last-child td { border-bottom: none; }
      a { color: #7dd3fc; }
      .badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }
      .badge-green { background: rgba(74, 222, 128, 0.15); color: var(--green); }
      .badge-red { background: rgba(248, 113, 113, 0.15); color: var(--red); }
      .badge-pending { background: rgba(245, 158, 11, 0.15); color: var(--amber); }
      .badge-unknown { background: rgba(139, 147, 165, 0.15); color: var(--dim); }
      .dim { color: var(--dim); }
      .wf-row { display: flex; flex-wrap: wrap; gap: 12px; max-width: 1100px; margin-bottom: 20px; }
      .wf-item {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }
      section h2.section-title { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); margin: 0 0 8px; }
      .tabs { display: flex; gap: 8px; margin-bottom: 20px; }
      .tab-btn {
        background: var(--panel);
        border: 1px solid var(--line);
        color: var(--dim);
        padding: 8px 16px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .tab-btn.active { color: var(--text); border-color: #7dd3fc; background: rgba(125, 211, 252, 0.1); }
      .hidden { display: none !important; }
      .filter-bar { max-width: 1100px; margin-bottom: 14px; }
      .chip-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .chip {
        background: var(--panel);
        border: 1px solid var(--line);
        color: var(--dim);
        padding: 4px 12px;
        border-radius: 999px;
        font-size: 12px;
        cursor: pointer;
      }
      .chip.active { color: var(--text); border-color: var(--green); background: rgba(74, 222, 128, 0.12); }
      .text-filter {
        width: 100%;
        max-width: 320px;
        background: var(--panel);
        border: 1px solid var(--line);
        color: var(--text);
        border-radius: 8px;
        padding: 6px 10px;
        font: inherit;
      }
      .issue-row {
        border-left: 3px solid var(--line);
        padding: 6px 12px;
        margin: 8px 0;
        border-radius: 0 8px 8px 0;
        background: rgba(255, 255, 255, 0.02);
        max-width: 1100px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .issue-row b { flex-basis: 100%; font-size: 14px; }
      .issue-row b a { color: var(--text); }
      .issue-closed { opacity: 0.55; }
      .badge-open { background: rgba(74, 222, 128, 0.15); color: var(--green); }
      .badge-closed { background: rgba(139, 147, 165, 0.15); color: var(--dim); }
      .plan-row {
        border-left: 3px solid var(--line);
        padding: 6px 12px;
        margin: 8px 0;
        border-radius: 0 8px 8px 0;
        background: rgba(255, 255, 255, 0.02);
        max-width: 1100px;
      }
      .plan-row b a { color: var(--text); }
      .plan-complete { opacity: 0.55; }
    </style>
  </head>
  <body>
    <h1>LifeOS Work Map</h1>
    <div class="sub">generated ${generatedLabel} from live GitHub state</div>

    <div class="tabs">
      <button type="button" class="tab-btn active" data-view="view-now">Now</button>
      <button type="button" class="tab-btn" data-view="view-full">Full map</button>
    </div>

    <div class="view" id="view-now">
      ${ghUnavailableSection}

      <div class="owner-queue">
        <h2>Owner Queue</h2>
        <ul>${ownerQueueItems}</ul>
      </div>

      <div class="agent-queue">
        <h2>Agent pickup queue</h2>
        ${agentPickupErrorHtml}
        <ul>${agentPickupItems}</ul>
      </div>

      <div class="grid">
        ${lanesHtml}
      </div>

      <section>
        <h2 class="section-title">Open PRs</h2>
        <table>
          <thead><tr><th>PR</th><th>Title</th><th>Author</th><th>CI</th><th>State</th></tr></thead>
          <tbody>
            ${prRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2 class="section-title">Workflow health</h2>
        <div class="wf-row">
          ${workflowRows}
        </div>
      </section>

      <section>
        <h2 class="section-title">Repo freshness</h2>
        ${freshnessHtml}
      </section>
    </div>

    <div class="view hidden" id="view-full">
      ${fullMapHtml}
    </div>

    <script>
      (function () {
        function all(sel) {
          return Array.prototype.slice.call(document.querySelectorAll(sel));
        }

        all(".tab-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            all(".tab-btn").forEach(function (b) {
              b.classList.remove("active");
            });
            btn.classList.add("active");
            all(".view").forEach(function (v) {
              v.classList.add("hidden");
            });
            var target = document.getElementById(btn.dataset.view);
            if (target) target.classList.remove("hidden");
          });
        });

        var filterState = { status: "open", labels: [], text: "" };

        function applyIssueFilters() {
          all("#issuesList .issue-row").forEach(function (row) {
            var show = true;
            var rowState = row.dataset.state;
            var rowLabels = (row.dataset.labels || "")
              .split(",")
              .filter(Boolean);
            var title = row.dataset.title || "";

            if (filterState.status !== "all" && rowState !== filterState.status) {
              show = false;
            }
            if (show && filterState.labels.length > 0) {
              var hasLabel = rowLabels.some(function (l) {
                return filterState.labels.indexOf(l) !== -1;
              });
              if (!hasLabel) show = false;
            }
            if (show && filterState.text && title.indexOf(filterState.text) === -1) {
              show = false;
            }

            row.classList.toggle("hidden", !show);
          });
        }

        all(".status-chip").forEach(function (chip) {
          chip.addEventListener("click", function () {
            all(".status-chip").forEach(function (c) {
              c.classList.remove("active");
            });
            chip.classList.add("active");
            filterState.status = chip.dataset.status;
            applyIssueFilters();
          });
        });

        all(".label-chip").forEach(function (chip) {
          chip.addEventListener("click", function () {
            var label = chip.dataset.label;
            var idx = filterState.labels.indexOf(label);
            if (idx === -1) {
              filterState.labels.push(label);
              chip.classList.add("active");
            } else {
              filterState.labels.splice(idx, 1);
              chip.classList.remove("active");
            }
            applyIssueFilters();
          });
        });

        var searchInput = document.getElementById("issueSearch");
        if (searchInput) {
          searchInput.addEventListener("input", function () {
            filterState.text = searchInput.value.toLowerCase();
            applyIssueFilters();
          });
        }

        applyIssueFilters();
      })();
    </script>
  </body>
</html>
`;
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
