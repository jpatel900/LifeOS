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

function printSuggestedActions(args) {
  section("SUGGESTED NEXT ACTIONS");
  const actions = buildSuggestedActions(args);

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
  };

  const auth = checkGhAvailable();
  if (!auth.ok) {
    data.ghAvailable = false;
    data.ghError = auth.message;
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

  const ownerQueueItems =
    data.ownerQueue.length === 0
      ? "<li>Nothing waiting on you right now.</li>"
      : data.ownerQueue
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("\n");

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
    </style>
  </head>
  <body>
    <h1>LifeOS Work Map</h1>
    <div class="sub">generated ${generatedLabel} from live GitHub state</div>

    ${ghUnavailableSection}

    <div class="owner-queue">
      <h2>Owner Queue</h2>
      <ul>${ownerQueueItems}</ul>
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

  try {
    printSuggestedActions({
      prs,
      pipelineEntries,
      epics,
      runs,
      manifest,
      driftRed,
    });
  } catch (err) {
    console.log(`SUGGESTED NEXT ACTIONS: error: ${err.message.split("\n")[0]}`);
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
  gatherMainFreshness,
  gatherHtmlStatusData,
  renderStatusHtml,
  escapeHtml,
  parseArgs,
};
