#!/usr/bin/env node
// Unit tests for the pure/testable pieces of scripts/agent/status.mjs.
//
// Not wired into `pnpm test` (vitest only covers apps/web/src; there is no
// existing test harness for scripts/agent/*.mjs in this repo). Run directly:
//   node scripts/agent/status.test.mjs
// Same convention as scripts/agent/provider-canary.test.mjs and
// scripts/agent/assemble-migration-sql.test.mjs.
//
// Importing status.mjs here must never shell out to `gh`, touch git, or
// write files: the module only does that work when run directly (guarded by
// the `isDirectRun` check at the bottom of status.mjs).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSuggestedActions,
  escapeHtml,
  parseArgs,
  renderStatusHtml,
} from "./status.mjs";

// ---------------------------------------------------------------------------
// buildSuggestedActions -- pure owner-queue logic
// ---------------------------------------------------------------------------

test("buildSuggestedActions: flags a red Migration Drift run first", () => {
  const actions = buildSuggestedActions({
    prs: [],
    pipelineEntries: [],
    epics: [],
    runs: [],
    manifest: { epic: 1 },
    driftRed: true,
  });
  assert.equal(actions.length, 1);
  assert.match(actions[0], /Migration Drift RED/);
});

test("buildSuggestedActions: suggests merging an awaiting PR", () => {
  const actions = buildSuggestedActions({
    prs: [{ number: 42, awaiting: true }],
    pipelineEntries: [],
    epics: [],
    runs: [],
    manifest: { epic: 1 },
    driftRed: false,
  });
  assert.ok(actions.includes("merge PR #42 (green, non-draft)"));
});

test("buildSuggestedActions: suggests closing the epic once all pipeline steps are closed", () => {
  const actions = buildSuggestedActions({
    prs: [],
    pipelineEntries: [{ isOpen: false }, { isOpen: false }],
    epics: [{ number: 7 }],
    runs: [],
    manifest: { epic: 7 },
    driftRed: false,
  });
  assert.ok(actions.includes("close epic #7 (all pipeline steps closed)"));
});

test("buildSuggestedActions: flags a non-success completed run on main", () => {
  const actions = buildSuggestedActions({
    prs: [],
    pipelineEntries: [],
    epics: [],
    runs: [{ name: "CI", status: "completed", conclusion: "failure" }],
    manifest: { epic: 1 },
    driftRed: false,
  });
  assert.ok(actions.includes('investigate red run "CI"'));
});

test("buildSuggestedActions: empty when nothing needs the owner", () => {
  const actions = buildSuggestedActions({
    prs: [{ number: 1, awaiting: false }],
    pipelineEntries: [{ isOpen: true }],
    epics: [],
    runs: [{ name: "CI", status: "completed", conclusion: "success" }],
    manifest: { epic: 1 },
    driftRed: false,
  });
  assert.deepEqual(actions, []);
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

test("parseArgs: detects --html and a following --out path", () => {
  assert.deepEqual(parseArgs(["--html", "--out", "custom.html"]), {
    html: true,
    out: "custom.html",
  });
});

test("parseArgs: defaults when no flags are passed", () => {
  assert.deepEqual(parseArgs([]), { html: false, out: null });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

test("escapeHtml: escapes the five reserved characters", () => {
  assert.equal(escapeHtml(`<script>&"'`), "&lt;script&gt;&amp;&quot;&#39;");
});

// ---------------------------------------------------------------------------
// renderStatusHtml -- pure render, fixture-driven
// ---------------------------------------------------------------------------

function baseFixture(overrides = {}) {
  return {
    generatedAt: "2026-07-09T12:00:00.000Z",
    ghAvailable: true,
    ghError: null,
    ownerQueue: [],
    prs: [],
    prsError: null,
    lanes: { mode: "open", groups: { open: [] } },
    issuesError: null,
    workflows: [],
    mainFreshness: {
      branch: "main",
      headSha: "abc1234",
      headDate: "2026-07-09T11:00:00-04:00",
      originSha: "abc1234",
      originDate: "2026-07-09T11:00:00-04:00",
      aheadOfOrigin: 0,
    },
    ...overrides,
  };
}

test("renderStatusHtml: renders the owner queue box with fixture items", () => {
  const html = renderStatusHtml(
    baseFixture({
      ownerQueue: [
        "merge PR #42 (green, non-draft)",
        "apply pending prod migrations (Migration Drift RED): pnpm drift:assemble <files>",
      ],
    }),
  );
  assert.match(html, /<div class="owner-queue">/);
  assert.match(html, /<h2>Owner Queue<\/h2>/);
  assert.match(html, /merge PR #42 \(green, non-draft\)/);
  assert.match(html, /Migration Drift RED/);
});

test("renderStatusHtml: renders the owner queue empty state when nothing is queued", () => {
  const html = renderStatusHtml(baseFixture());
  assert.match(html, /Nothing waiting on you right now\./);
});

test("renderStatusHtml: renders a PR row with number, title, author, and CI badge", () => {
  const html = renderStatusHtml(
    baseFixture({
      prs: [
        {
          number: 99,
          title: "Add work map",
          author: "jpatel900",
          status: "green",
          isDraft: false,
          url: "https://github.com/jpatel900/LifeOS/pull/99",
          awaiting: true,
        },
      ],
    }),
  );
  assert.match(html, /#99/);
  assert.match(html, /Add work map/);
  assert.match(html, /jpatel900/);
  assert.match(html, /badge-green">green<\/span>/);
  assert.match(html, /awaiting owner/);
});

test("renderStatusHtml: red CI status gets the red badge class", () => {
  const html = renderStatusHtml(
    baseFixture({
      prs: [
        {
          number: 5,
          title: "Broken PR",
          author: "someone",
          status: "red",
          isDraft: false,
          url: "https://github.com/x/y/pull/5",
          awaiting: false,
        },
      ],
    }),
  );
  assert.match(html, /badge-red">red<\/span>/);
});

test("renderStatusHtml: degraded mode renders an honest unavailable section instead of throwing", () => {
  const html = renderStatusHtml(
    baseFixture({
      ghAvailable: false,
      ghError: "gh: command not found",
      ownerQueue: [
        "GitHub data unavailable -- owner queue could not be computed.",
      ],
    }),
  );
  assert.match(html, /GitHub data unavailable/);
  assert.match(html, /gh: command not found/);
});

test("renderStatusHtml: renders usability/enjoyability lanes when that mode is set", () => {
  const html = renderStatusHtml(
    baseFixture({
      lanes: {
        mode: "usability-enjoyability",
        groups: {
          usability: [
            { number: 10, title: "Fix nav", labels: ["usability"], url: "#" },
          ],
          enjoyability: [
            {
              number: 11,
              title: "Add confetti",
              labels: ["enjoyability"],
              url: "#",
            },
          ],
        },
      },
    }),
  );
  assert.match(html, /Usability/);
  assert.match(html, /Enjoyability/);
  assert.match(html, /Fix nav/);
  assert.match(html, /Add confetti/);
});

test("renderStatusHtml: contains no external http(s) resource references", () => {
  const html = renderStatusHtml(
    baseFixture({
      prs: [
        {
          number: 1,
          title: "PR title",
          author: "someone",
          status: "green",
          isDraft: false,
          url: "https://github.com/x/y/pull/1",
          awaiting: false,
        },
      ],
      lanes: {
        mode: "open",
        groups: {
          open: [
            {
              number: 2,
              title: "issue title",
              labels: [],
              url: "https://github.com/x/y/issues/2",
            },
          ],
        },
      },
    }),
  );

  // <a href="https://..."> plain-text links are the app's own GitHub deep
  // links (data, not fetched resources) -- fine. What must never appear is a
  // fetchable/loadable external resource: <script src=, <link rel=stylesheet
  // href=, <img src=, @import, or a CSS url(...) pointing off-page.
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(html, /<img[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /url\(\s*['"]?https?:/i);
});

test("renderStatusHtml: is a single self-contained document (no separate CSS/JS files)", () => {
  const html = renderStatusHtml(baseFixture());
  assert.match(html, /<style>/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
});
