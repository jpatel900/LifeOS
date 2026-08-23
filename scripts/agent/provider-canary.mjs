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
//
// Issue #874 follow-up: authenticating the probe. /api/parse-capture's auth
// gate (#684) needs a real bearer token, so the probe now signs in first as
// the same dedicated smoke account the weekly prod smoke uses, with the
// SAME credentials it already has (no new secret):
//   SMOKE_EMAIL / SMOKE_PASSWORD                    (existing secrets)
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (existing repo
//                          VARIABLES -- public by design, see
//                          weekly-prod-smoke.yml's own comment -- already
//                          wired into that workflow the same way)
// Sign-in reuses the exact mechanism packages/cli/src/auth.ts's login() and
// apps/web/src/app/login/page.tsx both call through supabase-js:
// POST {supabaseUrl}/auth/v1/token?grant_type=password. This script calls
// that endpoint with plain `fetch` instead of depending on
// @supabase/supabase-js: the workflow runs `node scripts/agent/provider-canary.mjs`
// directly with no `pnpm install` step (near-free by construction, NFR-001),
// and adding the dependency would mean adding an install step to every
// 30-minute tick just to make one HTTP call this file can already make with
// its existing `fetch`-only style (see runSyntheticProbe below). Same
// mechanism, no new dependency.
//
// Correction to the originally-assumed premise: /api/parse-capture does NOT
// persist a capture. Read apps/web/src/lib/ai/parseCaptureService.ts and
// apps/web/src/lib/observability/aiCallTraces.ts: the only Postgres write on
// this path is recordAiCallTrace's `ai_call_traces` insert (metadata only --
// model, tokens, latency, validation_outcome; NO raw text, see that module's
// own header). apps/web/src/app/api/parse-capture/route.test.ts's own suite
// (10 cases) never asserts a persisted row either. So authenticating the
// probe does not litter capture_items / tasks the way the smoke's Playwright
// journey does; the smoke's marker+cleanup convention is not needed here.
// The one row it does write lands under the SAME dedicated smoke account
// used elsewhere (identifiable by that account's user_id, exactly like the
// smoke's own rows), and it's the same near-free metadata this canary itself
// reads on every tick.
//
// Masking-loop hazard this activates (and the fix): once the probe writes a
// REAL `ai_call_traces` row, fetchRecentTraceRows (no user_id filter) reads
// it back on the NEXT tick. A single failing probe writes one non-"passed"
// row; evaluateTraceSignal's CONSECUTIVE_FAILURE_THRESHOLD is 3, so that one
// row alone reports the trace state as "healthy" -- which, under the
// original decideProbeAction (state-only), would skip probing on the next
// tick and let a live outage read as "healthy", closing an incident issue
// mid-outage. decideProbeAction now also fires whenever
// signal.recentFailedCount > 0, so a still-failing provider gets re-probed
// (and re-confirmed) every tick until it recovers, closing that gap without
// widening the cost cap for the common (healthy, zero recent failures) case.

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
 * @typedef {SignalState | "misconfigured"} ProbeState
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
 * construction: only fires when there is no recent real signal to read, the
 * recent signal already looks like a failure (confirm before alerting), or
 * ANY recent row in the window failed even if below the consecutive-failure
 * threshold.
 *
 * That last clause exists because the probe is now authenticated (#874
 * follow-up): a failing probe writes a real `ai_call_traces` row, and
 * fetchRecentTraceRows has no user_id filter, so the canary reads its own
 * prior probe back as "signal" on the next tick. A single failing tick
 * writes exactly one non-"passed" row -- below CONSECUTIVE_FAILURE_THRESHOLD
 * (3), so evaluateTraceSignal alone would call that "healthy" and (with the
 * old state-only check) skip re-probing, letting a live outage go quiet and
 * an open incident issue close mid-outage. Firing on any recentFailedCount
 * keeps re-confirming every tick for as long as a recent failure is on
 * record (real or the canary's own), and costs nothing extra in the common
 * healthy/zero-recent-failures case.
 *
 * @param {{ state: SignalState, recentFailedCount?: number }} signal
 * @returns {boolean}
 */
export function decideProbeAction(signal) {
  return (
    signal.state === "no_signal" ||
    signal.state === "failing" ||
    (signal.recentFailedCount ?? 0) > 0
  );
}

/**
 * Classify the outcome of a synthetic /api/parse-capture POST.
 *
 * @param {{ ok: boolean, httpStatus: number, parser?: string, degraded?: boolean } | null} result
 *   `null` means the probe itself could not be attempted (e.g. no fetch
 *   possible) and should be treated as no additional evidence gathered.
 * @returns {ProbeState}
 */
export function classifySyntheticProbe(result) {
  if (!result) {
    return "no_signal";
  }

  // A 401/403 means the probe itself was rejected before reaching the
  // provider -- e.g. the unauthenticated synthetic request tripping
  // /api/parse-capture's auth gate (#684, HIGH-1). That is a canary
  // configuration problem, NOT evidence the AI provider is down, and must
  // never be conflated with "failing" (see 2026-07-18 incident: every
  // probe 401'd and the canary reported a false provider outage for three
  // weeks straight).
  if (result.httpStatus === 401 || result.httpStatus === 403) {
    return "misconfigured";
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
 * Classify a sign-in attempt made to mint the bearer token the synthetic
 * probe authenticates with. A sign-in failure -- bad/rotated
 * SMOKE_EMAIL/SMOKE_PASSWORD, the Supabase project itself unreachable, or
 * the auth endpoint rejecting the request -- is the canary's OWN setup
 * problem, never evidence the AI PROVIDER is down. It must classify the same
 * way a probe-side 401/403 does (#874's original fix): "misconfigured",
 * never "failing" -- otherwise an expired test credential would manufacture
 * a false provider-outage alarm.
 *
 * @param {{ ok: boolean, accessToken?: string | null, httpStatus?: number } | null} signInResult
 * @returns {"misconfigured" | null} "misconfigured" when the caller must
 *   skip the synthetic probe entirely and use this as the probe state
 *   directly; null when sign-in succeeded and signInResult.accessToken is
 *   usable.
 */
export function classifySignIn(signInResult) {
  if (
    !signInResult ||
    !signInResult.ok ||
    typeof signInResult.accessToken !== "string" ||
    !signInResult.accessToken
  ) {
    return "misconfigured";
  }

  return null;
}

/**
 * Merge the trace-read signal and (if run) the synthetic-probe signal into
 * one final state for this canary tick.
 *
 * @param {SignalState} traceState
 * @param {ProbeState | null} probeState  null when no probe was run
 * @returns {"healthy" | "failing" | "misconfigured"} final state.
 *   "no_signal" (no probe run, or the probe attempt failed to execute) and
 *   "misconfigured" (the probe was rejected by an auth gate rather than the
 *   provider) are not evidence either way and fall back to the trace
 *   signal -- absence, or an unrelated auth problem, must never raise (or
 *   mask) a false alarm. A trace-confirmed "failing" wins over a
 *   misconfigured probe so a real outage is never hidden behind the
 *   canary's own auth setup.
 */
export function resolveFinalState(traceState, probeState) {
  if (probeState === "healthy" || probeState === "failing") {
    return probeState;
  }

  if (probeState === "misconfigured" && traceState !== "failing") {
    return "misconfigured";
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

async function runSyntheticProbe({ baseUrl, accessToken }) {
  try {
    const response = await fetch(new URL("/api/parse-capture", baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
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

/**
 * Sign in as the dedicated smoke account to mint a bearer token for the
 * synthetic probe. Same GoTrue password-grant endpoint that
 * packages/cli/src/auth.ts's login() and apps/web/src/app/login/page.tsx's
 * handleSubmit both call through @supabase/supabase-js's
 * signInWithPassword -- called here with plain `fetch` instead of that
 * dependency, matching this script's existing dependency-free style (see
 * the file header for why: no `pnpm install` step runs before this script).
 *
 * Never logs the response body -- on failure it can echo the email back
 * (GoTrue error payloads sometimes do), and this repo's Actions logs are
 * publicly readable (jpatel900/LifeOS is a public repo). Callers get only
 * `ok` and (on failure) `httpStatus`.
 *
 * @returns {Promise<{ ok: boolean, accessToken?: string, httpStatus?: number } | null>}
 *   null means the request itself could not be attempted (e.g. network
 *   failure) -- classifySignIn treats that the same as any other failure.
 */
async function signInSmokeAccountForToken({
  supabaseUrl,
  supabaseAnonKey,
  email,
  password,
}) {
  if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
    return { ok: false };
  }

  try {
    const response = await fetch(
      new URL("/auth/v1/token?grant_type=password", supabaseUrl),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // supabase-js sends BOTH of these on every auth request (verified
          // against its GoTrue client) -- some project gateways require the
          // Authorization header in addition to apikey and 401 without it.
          // Match what packages/cli/src/auth.ts's login() and
          // login/page.tsx's handleSubmit actually send through
          // supabase-js, rather than betting on the shorter apikey-only
          // form silently working.
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ email, password }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== "string") {
      return { ok: false, httpStatus: response.status };
    }
    return { ok: true, accessToken: body.access_token };
  } catch {
    return null;
  }
}

/**
 * Orchestrate the authenticated probe: sign in as the smoke account, then
 * (only on success) run the synthetic probe with the minted token.
 * Injectable signInImpl/probeImpl/warn/log so this is unit-testable without
 * a real network call (see provider-canary.test.mjs) -- the same pattern
 * recordAiCallTrace's `dependencies` parameter uses elsewhere in this repo.
 *
 * @param {{
 *   smokeEmail: string | undefined,
 *   smokePassword: string | undefined,
 *   supabaseUrl: string | undefined,
 *   supabaseAnonKey: string | undefined,
 *   baseUrl: string,
 *   signInImpl?: typeof signInSmokeAccountForToken,
 *   probeImpl?: typeof runSyntheticProbe,
 *   warn?: (message: string) => void,
 * }} options
 * @returns {Promise<ProbeState>}
 */
export async function runAuthenticatedProbe({
  smokeEmail,
  smokePassword,
  supabaseUrl,
  supabaseAnonKey,
  baseUrl,
  signInImpl = signInSmokeAccountForToken,
  probeImpl = runSyntheticProbe,
  warn = (message) => console.log(`::warning::${message}`),
}) {
  const signInResult = await signInImpl({
    supabaseUrl,
    supabaseAnonKey,
    email: smokeEmail,
    password: smokePassword,
  });

  if (classifySignIn(signInResult) === "misconfigured") {
    // Status only -- never the response body (see signInSmokeAccountForToken's
    // header) and never anything derived from smokeEmail/smokePassword.
    const statusNote =
      signInResult && typeof signInResult.httpStatus === "number"
        ? `HTTP ${signInResult.httpStatus}`
        : "no response (network error or missing credentials)";
    warn(
      `Provider canary could not sign in as the smoke account to run the ` +
        `synthetic probe (${statusNote}). This is the canary's own auth ` +
        `setup (SMOKE_EMAIL/SMOKE_PASSWORD/NEXT_PUBLIC_SUPABASE_URL/` +
        `NEXT_PUBLIC_SUPABASE_ANON_KEY), never evidence the AI provider is ` +
        `down -- this tick proves nothing about provider health.`,
    );
    return "misconfigured";
  }

  const probeResult = await probeImpl({
    baseUrl,
    accessToken: signInResult.accessToken,
  });
  return classifySyntheticProbe(probeResult);
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
    // #874 follow-up: authenticate as the dedicated smoke account (same
    // SMOKE_EMAIL/SMOKE_PASSWORD secrets the weekly prod smoke already
    // uses) before probing, so the probe reaches the real AI provider path
    // instead of dying at /api/parse-capture's auth gate (#684) every time.
    probeState = await runAuthenticatedProbe({
      smokeEmail: process.env.SMOKE_EMAIL,
      smokePassword: process.env.SMOKE_PASSWORD,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      baseUrl,
    });
  }

  const finalState = resolveFinalState(signal.state, probeState);

  // NEVER include the access token here (or anywhere else in this
  // function) -- this line's output is tee'd straight into the public
  // Actions log (jpatel900/LifeOS is a public repo). probeState is always
  // one of the fixed enum strings ("healthy" | "failing" | "misconfigured"
  // | "no_signal"), never a value derived from the token or the sign-in
  // response body.
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

  if (finalState === "misconfigured") {
    // Not a provider outage -- either the sign-in itself failed (see the
    // specific warning runAuthenticatedProbe already emitted above) or the
    // probe still got a 401/403 from /api/parse-capture's auth gate even
    // with a freshly minted token (e.g. a revoked/disabled smoke account).
    // Warn (not error/exit 1) either way so this doesn't page anyone or
    // open a false incident issue every 30 minutes; it's a canary setup
    // gap for the owner to fix on their own time.
    console.log(
      "::warning::Provider canary's probe did not reach the AI provider " +
        "this tick (sign-in failed, or the authenticated request was still " +
        "rejected by /api/parse-capture's auth gate) -- this tick proves " +
        "nothing about provider health. See the warning above (if any) " +
        "for the specific cause.",
    );
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
