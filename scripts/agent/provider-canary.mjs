#!/usr/bin/env node
// FR-030: Provider Canary + Mock-First Auto-Degrade.
//
// Detects when the production AI parse provider is silently down (the
// 2026-07-04 OpenAI 429 incident was only found by manual probing) and
// raises a GitHub issue on a healthy->failing transition. Near-free by
// construction (NFR-001): it reads recently-recorded real-parse outcomes
// from `ai_call_traces` first (a cheap Postgres read) and only issues a
// synthetic parse POST when there is no recent real signal, or to confirm
// a suspected transition. It never runs a paid parse on every tick.
//
// This module exports pure, unit-testable functions:
//   - evaluateTraceSignal(rows, now)     classify recent ai_call_traces rows
//   - decideProbeAction(signal)          decide whether a synthetic POST is needed
//   - classifySyntheticProbe(result)     classify a synthetic POST outcome
//   - decideTransition(previousState, currentState)  healthy<->failing edges
//   - findExistingCanaryIssue(issues)    dedupe: locate the open canary issue
//   - buildIssueBody / buildRecoveryComment  deterministic issue text
//
// The GitHub Actions entrypoint (main()) wires these together with `psql`
// (reusing SUPABASE_PROD_DB_URL, the same secret migration-drift.yml uses)
// for the trace read, `fetch` for the synthetic probe, and `actions/github-script`
// -equivalent REST calls (via the provided github-script `github`/`context`
// globals when invoked from the workflow) for the issue read/write.
//
// Run directly (workflow_dispatch / cron) via:
//   node scripts/agent/provider-canary.mjs
//
// Required secrets (see PR body "Secrets required" for the full list):
//   SUPABASE_PROD_DB_URL   Postgres connection string, read-only role preferred
//                          (same secret as migration-drift.yml).
//   SMOKE_BASE_URL         Base URL of the deployed app (same variable used by
//                          scripts/run-prod-smoke.mjs), used only to target the
//                          synthetic POST at /api/parse-capture.
// Both are skip-with-warning when absent, matching migration-drift's shape.

export const CANARY_ISSUE_LABEL = "provider-canary";
export const CANARY_SURFACE = "parse";

// A recent-signal window short enough to catch an hours-long outage quickly,
// long enough that a quiet overnight period doesn't force a synthetic probe
// on every tick (cron interval is 30 min; see workflow comment).
export const RECENT_SIGNAL_WINDOW_MINUTES = 45;

// A single failed real-parse outcome does not prove an outage (could be one
// user's bad input triggering a schema failure). Consecutive-failure count
// before treating the recent-signal window itself as "failing".
export const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/**
 * @typedef {{ validation_outcome: string, created_at: string }} TraceRow
 * @typedef {"healthy" | "failing" | "no_signal"} SignalState
 */

/**
 * Classify recent ai_call_traces rows for the canary surface into a signal
 * state. Rows are expected pre-filtered to surface='parse' and ordered
 * newest-first by the caller's SQL query.
 *
 * @param {TraceRow[]} rows
 * @param {Date} [now]
 * @returns {{ state: SignalState, recentCount: number, recentFailedCount: number }}
 */
export function evaluateTraceSignal(rows, now = new Date()) {
  const windowMs = RECENT_SIGNAL_WINDOW_MINUTES * 60 * 1000;
  const cutoff = now.getTime() - windowMs;

  const recent = (rows ?? []).filter((row) => {
    const t = Date.parse(row.created_at);
    return Number.isFinite(t) && t >= cutoff;
  });

  if (recent.length === 0) {
    return { state: "no_signal", recentCount: 0, recentFailedCount: 0 };
  }

  // Consecutive failures counted from the newest row backwards; a single
  // recent success ends the run (matches "detected failure state
  // transition", not "any failure ever").
  let consecutiveFailed = 0;
  for (const row of recent) {
    if (row.validation_outcome === "passed") {
      break;
    }
    consecutiveFailed += 1;
  }

  const recentFailedCount = recent.filter(
    (row) => row.validation_outcome !== "passed",
  ).length;

  const state =
    consecutiveFailed >= CONSECUTIVE_FAILURE_THRESHOLD ? "failing" : "healthy";

  return { state, recentCount: recent.length, recentFailedCount };
}

/**
 * Decide whether a synthetic parse POST is required. Near-free by
 * construction: only fires when there is no recent real signal to read, or
 * the recent signal already looks like a failure (confirm before alerting).
 *
 * @param {{ state: SignalState }} signal
 * @returns {boolean}
 */
export function decideProbeAction(signal) {
  return signal.state === "no_signal" || signal.state === "failing";
}

/**
 * Classify the outcome of a synthetic /api/parse-capture POST.
 *
 * @param {{ ok: boolean, httpStatus: number, parser?: string, degraded?: boolean } | null} result
 *   `null` means the probe itself could not be attempted (e.g. no fetch
 *   possible) and should be treated as no additional evidence gathered.
 * @returns {SignalState}
 */
export function classifySyntheticProbe(result) {
  if (!result) {
    return "no_signal";
  }

  if (!result.ok || result.httpStatus >= 500 || result.httpStatus === 429) {
    return "failing";
  }

  // A 200 with parser:"mock" and degraded:true means the app already
  // auto-degraded because of a runtime-down response inside this same
  // request (FR-030 app-side degrade) -- that is itself evidence of an
  // outage, not health.
  if (result.parser === "mock" && result.degraded) {
    return "failing";
  }

  return "healthy";
}

/**
 * Merge the trace-read signal and (if run) the synthetic-probe signal into
 * one final state for this canary tick.
 *
 * @param {SignalState} traceState
 * @param {SignalState | null} probeState  null when no probe was run
 * @returns {"healthy" | "failing"} final state; "no_signal" alone (no probe
 *   run, e.g. probe attempt failed to execute) degrades safely to "healthy"
 *   -- absence of evidence must never raise a false alarm.
 */
export function resolveFinalState(traceState, probeState) {
  if (probeState) {
    return probeState;
  }

  return traceState === "failing" ? "failing" : "healthy";
}

/**
 * Compute the healthy<->failing transition given the last known state
 * (read from the existing open canary issue, if any) and the current tick's
 * final state. Returns which action to take -- never "spam an issue every
 * run" (FR-030).
 *
 * @param {"healthy" | "failing" | null} previousState  null = no prior issue,
 *   treated as healthy (first run / no incident on record).
 * @param {"healthy" | "failing"} currentState
 * @returns {"open_issue" | "post_recovery" | "no_op"}
 */
export function decideTransition(previousState, currentState) {
  const prior = previousState ?? "healthy";

  if (prior !== "failing" && currentState === "failing") {
    return "open_issue";
  }

  if (prior === "failing" && currentState === "healthy") {
    return "post_recovery";
  }

  return "no_op";
}

/**
 * Dedupe: find the currently-open canary-labelled issue, if any. Mirrors
 * pipeline-advance's "check for an existing open ... issue" convention
 * instead of inventing new state storage.
 *
 * @param {{ number: number, state: string, labels: (string | { name: string })[] }[]} issues
 * @returns {{ number: number } | null}
 */
export function findExistingCanaryIssue(issues) {
  const open = (issues ?? []).find((issue) => {
    if (issue.state !== "open") {
      return false;
    }
    const labelNames = (issue.labels ?? []).map((label) =>
      typeof label === "string" ? label : label.name,
    );
    return labelNames.includes(CANARY_ISSUE_LABEL);
  });

  return open ? { number: open.number } : null;
}

export function buildIssueTitle() {
  return "Provider canary: AI parse provider appears down";
}

export function buildIssueBody({ recentFailedCount, recentCount, detectedAt }) {
  return [
    `The provider canary (\`.github/workflows/provider-canary.yml\`) detected a healthy -> failing transition for the \`${CANARY_SURFACE}\` surface at ${detectedAt}.`,
    "",
    recentCount > 0
      ? `Evidence: ${recentFailedCount}/${recentCount} recent real parse attempts in the last ${RECENT_SIGNAL_WINDOW_MINUTES} minutes failed, and/or a synthetic probe confirmed a runtime failure.`
      : "Evidence: no recent real parse traffic; a synthetic probe confirmed a runtime failure.",
    "",
    "The app auto-degrades to the mock parser for affected requests (FR-030); users are not blocked, but AI-assisted parsing is unavailable until this recovers.",
    "",
    "This issue will get a recovery comment automatically once the canary observes a healthy tick again. Do not close manually while the provider is still down -- closing early will cause a duplicate issue on the next failing tick.",
  ].join("\n");
}

export function buildRecoveryComment({ recoveredAt }) {
  return `Provider canary: recovered. A healthy tick was observed at ${recoveredAt}. Closing.`;
}

// ---------------------------------------------------------------------------
// Workflow entrypoint. Only runs the side-effecting parts when invoked
// directly (not when imported for unit tests).
// ---------------------------------------------------------------------------

async function fetchRecentTraceRows({ dbUrl, windowMinutes }) {
  const { execFileSync } = await import("node:child_process");
  const sql = `select validation_outcome, created_at from public.ai_call_traces where surface = '${CANARY_SURFACE}' and created_at >= now() - interval '${windowMinutes} minutes' order by created_at desc limit 50;`;
  const output = execFileSync(
    "psql",
    [dbUrl, "-tAc", sql, "--field-separator=|"],
    { encoding: "utf8" },
  );

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [validation_outcome, created_at] = line.split("|");
      return { validation_outcome, created_at };
    });
}

async function runSyntheticProbe({ baseUrl }) {
  try {
    const response = await fetch(new URL("/api/parse-capture", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText:
          "Provider canary synthetic probe -- deterministic text, not a real capture.",
        parserMode: "auto",
      }),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok && body.ok === true,
      httpStatus: response.status,
      parser: body.parser,
      degraded: body.degraded,
    };
  } catch {
    return null;
  }
}

async function main() {
  const dbUrl = process.env.SUPABASE_PROD_DB_URL;
  const baseUrl = process.env.SMOKE_BASE_URL;

  if (!dbUrl) {
    console.log(
      "::warning::SUPABASE_PROD_DB_URL secret is not set; skipping the provider canary.",
    );
    return;
  }

  if (!baseUrl) {
    console.log(
      "::warning::SMOKE_BASE_URL secret is not set; skipping the provider canary (cannot run the synthetic probe fallback).",
    );
    return;
  }

  const rows = await fetchRecentTraceRows({
    dbUrl,
    windowMinutes: RECENT_SIGNAL_WINDOW_MINUTES,
  });
  const signal = evaluateTraceSignal(rows);

  let probeState = null;
  if (decideProbeAction(signal)) {
    const probeResult = await runSyntheticProbe({ baseUrl });
    probeState = classifySyntheticProbe(probeResult);
  }

  const finalState = resolveFinalState(signal.state, probeState);

  console.log(
    `Provider canary: trace signal=${signal.state} (recent=${signal.recentCount}, failed=${signal.recentFailedCount}), probe=${probeState ?? "not run"}, final=${finalState}`,
  );

  // Issue read/write is delegated to the GitHub Actions workflow step
  // (actions/github-script), which has an authenticated Octokit client
  // available. This script prints the final state as a machine-readable
  // line the workflow step parses; see provider-canary.yml.
  console.log(`PROVIDER_CANARY_STATE=${finalState}`);

  if (finalState === "failing") {
    console.log(
      "::error::Provider canary detected the AI parse provider is down.",
    );
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file://").href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(`::error::Provider canary failed: ${error.message}`);
    process.exitCode = 1;
  });
}
