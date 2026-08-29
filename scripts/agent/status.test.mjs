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
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  buildGateQueues,
  buildSuggestedActions,
  escapeHtml,
  extractCheckboxGateItems,
  formatGateItem,
  gitCommitCount,
  gitLogAllMessages,
  parseArgs,
  renderStatusHtml,
} from "./status.mjs";
import {
  buildHealthCells,
  classifyOwnerItem,
  collectDataProblems,
  extractCampaignSliceRefs,
  parseCampaigns,
  parseLatestProgramNote,
  parseSlices,
  partitionOwnerQueue,
} from "./status-html.mjs";

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
    allIssues: [],
    allIssuesError: null,
    plans: [],
    plansError: null,
    agentPickupQueue: [],
    gateItemsError: null,
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
  // Re-anchored 2026-08-05 (work map redesign): the section keeps its
  // `owner-queue` hook, but its heading is now the plain-language "Waiting on
  // you" rather than the jargon "Owner Queue". Same section, new words.
  assert.match(html, /class="block owner-queue"/);
  assert.match(html, /Waiting on you/);
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

// ---------------------------------------------------------------------------
// Two-view work map: tabs, Full map (all issues incl. closed), Plans & ideas
// ---------------------------------------------------------------------------

test("renderStatusHtml: renders tab markup for both views, Now active by default", () => {
  const html = renderStatusHtml(baseFixture());
  assert.match(html, /class="tab-btn active" data-view="view-now"/);
  assert.match(html, /class="tab-btn" data-view="view-full"/);
  assert.match(html, /id="view-now"/);
  assert.match(html, /class="view hidden" id="view-full"/);
});

test("renderStatusHtml: default status filter chip is Open and marked active", () => {
  const html = renderStatusHtml(baseFixture());
  assert.match(
    html,
    /class="chip status-chip active" data-status="open">Open<\//,
  );
  assert.match(html, /class="chip status-chip" data-status="closed">Closed<\//);
  assert.match(html, /class="chip status-chip" data-status="all">All<\//);
});

test("renderStatusHtml: renders a closed issue row muted, not strikethrough, with a closed badge", () => {
  const html = renderStatusHtml(
    baseFixture({
      allIssues: [
        {
          number: 100,
          title: "Shipped feature",
          state: "CLOSED",
          labels: ["enjoyability"],
          url: "https://github.com/jpatel900/LifeOS/issues/100",
          createdAt: "2026-06-01T00:00:00Z",
          closedAt: "2026-07-01T00:00:00Z",
        },
      ],
    }),
  );
  assert.match(html, /issue-row issue-closed/);
  assert.match(html, /data-state="closed"/);
  assert.match(html, /badge-closed">closed<\/span>/);
  assert.match(html, /Shipped feature/);
  assert.doesNotMatch(html, /<s>|text-decoration:\s*line-through/);
});

test("renderStatusHtml: renders an open issue row with data attributes for filtering", () => {
  const html = renderStatusHtml(
    baseFixture({
      allIssues: [
        {
          number: 101,
          title: "Still open work",
          state: "OPEN",
          labels: ["usability"],
          url: "https://github.com/jpatel900/LifeOS/issues/101",
          createdAt: "2026-07-01T00:00:00Z",
          closedAt: null,
        },
      ],
    }),
  );
  assert.match(html, /data-state="open"/);
  assert.match(html, /data-labels="usability"/);
  assert.match(html, /badge-open">open<\/span>/);
  assert.match(html, /class="chip label-chip" data-label="usability"/);
});

test("renderStatusHtml: shows open/closed issue counts in the section title", () => {
  const html = renderStatusHtml(
    baseFixture({
      allIssues: [
        { number: 1, title: "a", state: "OPEN", labels: [], url: "#" },
        { number: 2, title: "b", state: "CLOSED", labels: [], url: "#" },
        { number: 3, title: "c", state: "CLOSED", labels: [], url: "#" },
      ],
    }),
  );
  assert.match(html, /All issues \(1 open \/ 2 closed\)/);
});

test("renderStatusHtml: degraded full-map issues renders an honest unavailable message", () => {
  const html = renderStatusHtml(
    baseFixture({ allIssuesError: "gh: rate limited" }),
  );
  assert.match(html, /Issue data unavailable: gh: rate limited/);
});

test("renderStatusHtml: renders the Plans & ideas section with STATUS detection", () => {
  const html = renderStatusHtml(
    baseFixture({
      plans: [
        {
          path: "docs/implementation-planning/plan-daily-driver-floor.md",
          status: "COMPLETE -- shipped as of 2026-07-08; kept for reference.",
          complete: true,
          url: "https://github.com/jpatel900/LifeOS/blob/main/docs/implementation-planning/plan-daily-driver-floor.md",
        },
        {
          path: "docs/implementation-planning/plan-dual-critical-path.md",
          status: null,
          complete: false,
          url: "https://github.com/jpatel900/LifeOS/blob/main/docs/implementation-planning/plan-dual-critical-path.md",
        },
      ],
    }),
  );
  assert.match(html, /plan-row plan-complete/);
  assert.match(html, /plan-daily-driver-floor\.md/);
  assert.match(html, /COMPLETE -- shipped as of 2026-07-08/);
  assert.match(html, /plan-dual-critical-path\.md/);
  assert.match(html, /no STATUS line/);
  assert.match(
    html,
    /href="https:\/\/github\.com\/jpatel900\/LifeOS\/blob\/main\/docs\/implementation-planning\/plan-daily-driver-floor\.md"/,
  );
});

test("renderStatusHtml: degraded plans section renders an honest unavailable message", () => {
  const html = renderStatusHtml(
    baseFixture({ plansError: "git ls-files failed" }),
  );
  assert.match(html, /Plans data unavailable: git ls-files failed/);
});

// ---------------------------------------------------------------------------
// OWNER-GATE / AGENT-TODO mechanical triage collector
// ---------------------------------------------------------------------------

const ISSUE_SOURCE = {
  type: "issue",
  number: 10,
  title: "Some issue",
  url: "https://github.com/jpatel900/LifeOS/issues/10",
};

test("extractCheckboxGateItems: finds an unchecked OWNER-GATE line", () => {
  const body = [
    "Follow-ups:",
    "- [ ] OWNER-GATE: set the SUPABASE_PROD_MIGRATOR_URL secret",
  ].join("\n");
  const items = extractCheckboxGateItems(body, ISSUE_SOURCE);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "owner-gate");
  assert.match(items[0].text, /OWNER-GATE: set the SUPABASE/);
});

test("extractCheckboxGateItems: finds an unchecked AGENT-TODO line", () => {
  const body = "- [ ] AGENT-TODO: add a guard test for the new export table";
  const items = extractCheckboxGateItems(body, ISSUE_SOURCE);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "agent-todo");
});

test("extractCheckboxGateItems: excludes checked [x] boxes", () => {
  const body = [
    "- [x] OWNER-GATE: already done, should not appear",
    "- [X] AGENT-TODO: also done, capital X should not appear",
  ].join("\n");
  const items = extractCheckboxGateItems(body, ISSUE_SOURCE);
  assert.deepEqual(items, []);
});

test("extractCheckboxGateItems: legacy-untagged heuristic matches unchecked lines containing 'Owner'", () => {
  const body = "- [ ] Owner: decide whether to enable the flag";
  const items = extractCheckboxGateItems(body, ISSUE_SOURCE);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "legacy-owner");
});

test("extractCheckboxGateItems: ignores unchecked lines with no marker and no 'owner' word", () => {
  const body = "- [ ] just a plain todo with no tag or relevant mention";
  const items = extractCheckboxGateItems(body, ISSUE_SOURCE);
  assert.deepEqual(items, []);
});

test("extractCheckboxGateItems: degrades on a missing/non-string body instead of throwing", () => {
  assert.deepEqual(extractCheckboxGateItems(undefined, ISSUE_SOURCE), []);
  assert.deepEqual(extractCheckboxGateItems(null, ISSUE_SOURCE), []);
});

test("formatGateItem: strips the marker and builds a linked source label", () => {
  const formatted = formatGateItem({
    text: "OWNER-GATE: decide the rollout date",
    kind: "owner-gate",
    source: {
      type: "pr",
      number: 472,
      title: "chore(ci): ...",
      url: "https://github.com/jpatel900/LifeOS/pull/472",
    },
  });
  assert.equal(formatted.text, "decide the rollout date");
  assert.equal(formatted.refLabel, "PR #472");
  assert.equal(formatted.url, "https://github.com/jpatel900/LifeOS/pull/472");
});

test("formatGateItem: labels legacy-untagged items clearly", () => {
  const formatted = formatGateItem({
    text: "Owner: decide whether to enable the flag",
    kind: "legacy-owner",
    source: ISSUE_SOURCE,
  });
  assert.match(formatted.text, /^untagged \(legacy\): /);
});

test("buildGateQueues: routes owner-gate and legacy-owner into ownerItems, agent-todo into agentItems", () => {
  const items = [
    { text: "OWNER-GATE: a", kind: "owner-gate", source: ISSUE_SOURCE },
    { text: "AGENT-TODO: b", kind: "agent-todo", source: ISSUE_SOURCE },
    { text: "Owner: c", kind: "legacy-owner", source: ISSUE_SOURCE },
  ];
  const { ownerItems, agentItems } = buildGateQueues(items);
  assert.equal(ownerItems.length, 2);
  assert.equal(agentItems.length, 1);
  assert.equal(agentItems[0].text, "b");
});

test("renderStatusHtml: OWNER-GATE queue item renders in the owner queue with a linked source", () => {
  const html = renderStatusHtml(
    baseFixture({
      ownerQueue: [
        {
          text: "decide the rollout date",
          refLabel: "PR #472",
          url: "https://github.com/jpatel900/LifeOS/pull/472",
        },
      ],
    }),
  );
  assert.match(html, /decide the rollout date/);
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/jpatel900\/LifeOS\/pull\/472">PR #472<\/a>/,
  );
});

test("renderStatusHtml: legacy-untagged owner queue item is labelled as such", () => {
  const html = renderStatusHtml(
    baseFixture({
      ownerQueue: [
        {
          text: "untagged (legacy): decide whether to enable the flag",
          refLabel: "PR #471",
          url: "https://github.com/jpatel900/LifeOS/pull/471",
        },
      ],
    }),
  );
  assert.match(html, /untagged \(legacy\): decide whether to enable the flag/);
});

test("renderStatusHtml: AGENT-TODO items render in the new Agent pickup queue section", () => {
  const html = renderStatusHtml(
    baseFixture({
      agentPickupQueue: [
        {
          text: "add a guard test for the new export table",
          refLabel: "Issue #10",
          url: "https://github.com/jpatel900/LifeOS/issues/10",
        },
      ],
    }),
  );
  // Re-anchored 2026-08-05 (work map redesign): the agent queue moved behind a
  // collapsed expander below the owner's own queue, and its label is now plain
  // language. Same list, same source links, new words and new placement.
  assert.match(html, /Work agents can pick up/);
  assert.match(html, /add a guard test for the new export table/);
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/jpatel900\/LifeOS\/issues\/10">Issue #10<\/a>/,
  );
});

test("renderStatusHtml: Agent pickup queue empty state when nothing is agent-doable", () => {
  const html = renderStatusHtml(baseFixture());
  assert.match(html, /Nothing pre-classified as agent-doable right now\./);
});

test("renderStatusHtml: degraded gate-item scan renders an honest message instead of throwing", () => {
  const html = renderStatusHtml(
    baseFixture({ gateItemsError: "open issues: gh: rate limited" }),
  );
  assert.match(html, /Gate item scan degraded: open issues: gh: rate limited/);
});

// ---------------------------------------------------------------------------
// Work map redesign (2026-08-05): the data-truth rules.
//
// The map used to lie by staleness -- an unticked checkbox scraped from a PR
// body stayed in the owner's live queue forever, even after that PR merged or
// closed. These pin the fix: demote and label, never drop.
// ---------------------------------------------------------------------------

test("classifyOwnerItem: a gate item from an open source is live", () => {
  assert.deepEqual(
    classifyOwnerItem({ text: "a", refLabel: "Issue #1", sourceState: "open" }),
    { kind: "gate", stale: false },
  );
});

test("classifyOwnerItem: a gate item from a merged or closed source is stale", () => {
  assert.equal(
    classifyOwnerItem({ text: "a", sourceState: "merged" }).stale,
    true,
  );
  assert.equal(
    classifyOwnerItem({ text: "a", sourceState: "closed" }).stale,
    true,
  );
});

test("classifyOwnerItem: an unknown source state is treated as live, not hidden", () => {
  // Fail open: a missing state must never make a real ask disappear.
  assert.equal(classifyOwnerItem({ text: "a" }).stale, false);
});

test("classifyOwnerItem: suggested-action strings keep their kinds", () => {
  assert.equal(
    classifyOwnerItem("merge PR #42 (green, non-draft)").kind,
    "merge",
  );
  assert.equal(
    classifyOwnerItem(
      "apply pending prod migrations (Migration Drift RED): pnpm drift:assemble",
    ).kind,
    "drift",
  );
  assert.equal(
    classifyOwnerItem('investigate red run "CI"').kind,
    "investigate",
  );
  assert.equal(
    classifyOwnerItem("close epic #7 (all steps closed)").kind,
    "epic",
  );
});

test("partitionOwnerQueue: ranks owner gates first, then merges, then the rest", () => {
  const { live } = partitionOwnerQueue([
    'investigate red run "CI"',
    "merge PR #42 (green, non-draft)",
    { text: "decide the rollout date", refLabel: "PR #1", sourceState: "open" },
  ]);
  assert.deepEqual(
    live.map((entry) => entry.kind),
    ["gate", "merge", "investigate"],
  );
});

test("partitionOwnerQueue: demotes closed-source items out of the live queue without losing them", () => {
  const stale = {
    text: "resolve revert PR #806",
    refLabel: "PR #800",
    sourceState: "merged",
    sourceAge: "2d",
  };
  const { live, stale: demoted } = partitionOwnerQueue([
    stale,
    { text: "still live", refLabel: "Issue #9", sourceState: "open" },
  ]);
  assert.equal(live.length, 1);
  assert.equal(live[0].item.text, "still live");
  assert.equal(demoted.length, 1);
  assert.equal(demoted[0].item.text, "resolve revert PR #806");
});

test("renderStatusHtml: a closed-source item is labelled stale and still rendered in full", () => {
  const html = renderStatusHtml(
    baseFixture({
      ownerQueue: [
        {
          text: "resolve revert PR #806",
          refLabel: "PR #800",
          url: "https://github.com/jpatel900/LifeOS/pull/800",
          sourceState: "merged",
          sourceAge: "2d",
        },
      ],
    }),
  );
  assert.match(html, /Possibly stale/);
  assert.match(html, /resolve revert PR #806/); // demoted, never dropped
  assert.match(html, /2d old/);
  // ...and it must not be counted as something waiting on the owner.
  assert.match(html, /Nothing waiting on you right now\./);
});

test("renderStatusHtml: only the first five live items show, the rest sit behind an expander", () => {
  const html = renderStatusHtml(
    baseFixture({
      ownerQueue: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        text: `gate item ${n}`,
        refLabel: `Issue #${n}`,
        url: "#",
        sourceState: "open",
      })),
    }),
  );
  assert.match(html, /The rest of your queue/);
  assert.match(html, /gate item 7/); // present, not truncated away
  assert.match(html, /7 items, most important first/);
});

// ---------------------------------------------------------------------------
// Program docs -- campaign strip
// ---------------------------------------------------------------------------

const PROGRAM_MD = [
  "## 4. Campaigns (final composition)",
  "",
  "- **C1 Trust & state truth** — sessions, durability. **CLOSED 2026-07-30 at 10/10.**",
  "- **C2 Structure & navigation** — one shell. **IN FLIGHT.**",
  "- **C3 First-run & onboarding** — new-account ritual to first capture.",
  "",
  "## 6. Program state (live)",
  "",
  "> ## CAMPAIGN C1 (TRUST) — CLOSED",
  "",
  "- **2026-08-05 — S2 RE-LANDED AND MERGED (#840):** the mechanism was found.",
  "- **2026-08-04 — C2 in flight, one setback:** older note.",
].join("\n");

test("parseCampaigns: reads id, name, and state from the canonical section 4", () => {
  const campaigns = parseCampaigns(PROGRAM_MD);
  assert.equal(campaigns.length, 3);
  assert.equal(campaigns[0].id, "C1");
  assert.equal(campaigns[0].state, "closed");
  assert.equal(campaigns[1].id, "C2");
  assert.equal(campaigns[1].state, "in-flight");
  assert.equal(campaigns[2].state, "queued");
  assert.equal(campaigns[1].name, "Structure & navigation");
});

test("parseCampaigns: degrades to an empty list rather than guessing", () => {
  assert.deepEqual(parseCampaigns("# some other document"), []);
  assert.deepEqual(parseCampaigns(undefined), []);
});

test("parseLatestProgramNote: takes the newest dated bullet from section 6", () => {
  const note = parseLatestProgramNote(PROGRAM_MD);
  assert.equal(note.date, "2026-08-05");
  assert.match(note.text, /S2 RE-LANDED AND MERGED/);
});

test("parseSlices: reads slice ids and names but never a slice state", () => {
  const slices = parseSlices(
    [
      "- **S0 — Door** (small): redirect to sign-in. — **LANDED (#803)**",
      "- **S2 — Port Plan/calendar** (largest). — merged (#804), then reverted",
      "- **RE-SCORE** — fresh-eyes judge.",
    ].join("\n"),
  );
  assert.deepEqual(
    slices.map((s) => s.id),
    ["S0", "S2", "RE-SCORE"],
  );
  assert.equal(slices[0].name, "Door");
  // The slice doc's own state words are captured as `detail` but the strip
  // never promotes them -- they were provably wrong on 2026-08-05.
  assert.ok(!("state" in slices[1]));
});

test("renderStatusHtml: campaign strip marks the in-flight campaign and cites its source file", () => {
  const html = renderStatusHtml(
    baseFixture({
      program: {
        campaigns: parseCampaigns(PROGRAM_MD),
        latestNote: parseLatestProgramNote(PROGRAM_MD),
        campaignsPath: "docs/program/final-ux-loop.md",
        campaignsAge: "3h",
        slices: [],
      },
    }),
  );
  assert.match(html, /camp camp-in-flight/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /1 of 3 done/);
  assert.match(html, /docs\/program\/final-ux-loop\.md/);
  assert.match(html, /last changed 3h ago/);
});

test("renderStatusHtml: missing program docs say so instead of showing an empty strip", () => {
  const html = renderStatusHtml(
    baseFixture({
      program: { campaigns: [], error: "ENOENT: no such file" },
    }),
  );
  assert.match(html, /Program state unavailable: ENOENT: no such file/);
});

// ---------------------------------------------------------------------------
// Health strip + honest failure reporting
// ---------------------------------------------------------------------------

test("buildHealthCells: a failing run on main reads as bad, not silent", () => {
  const cells = buildHealthCells({
    mainHealth: {
      runs: [
        { name: "CI", status: "completed", conclusion: "success" },
        { name: "Provider Canary", status: "completed", conclusion: "failure" },
      ],
    },
  });
  const main = cells.find((c) => c.label === "Main branch");
  assert.equal(main.tone, "bad");
  assert.match(main.verdict, /1 run is failing/);
  assert.match(main.detail, /Provider Canary/);
});

test("buildHealthCells: an unreadable signal reads as unknown, never as healthy", () => {
  const cells = buildHealthCells({
    mainHealth: { error: "gh: rate limited" },
    drift: { error: "gh: rate limited" },
    coherence: { error: "ENOENT" },
  });
  for (const label of ["Main branch", "Prod database", "Guards"]) {
    const cell = cells.find((c) => c.label === label);
    assert.equal(cell.tone, "unknown", `${label} must not read as healthy`);
    assert.match(cell.verdict, /could not check/);
  }
});

test("buildHealthCells: quiet guards and an up-to-date prod database read as ok", () => {
  const cells = buildHealthCells({
    coherence: { featureCount: 30, edgeCount: 23, unresolvedCount: 0 },
    drift: { found: true, red: false, conclusion: "success", age: "1h" },
  });
  assert.equal(cells.find((c) => c.label === "Guards").tone, "ok");
  assert.equal(cells.find((c) => c.label === "Prod database").tone, "ok");
});

test("collectDataProblems: every fetch failure is named with its reason", () => {
  const problems = collectDataProblems({
    prsError: "gh: rate limited",
    mainHealth: { error: "network down" },
    drift: { error: "no such workflow" },
    epicsError: "gh: rate limited",
  });
  assert.equal(problems.length, 4);
  assert.ok(
    problems.some(
      (p) => p.what === "recent runs on main" && p.reason === "network down",
    ),
  );
});

test("renderStatusHtml: data-fetch failures are surfaced on the page, not omitted", () => {
  const html = renderStatusHtml(
    baseFixture({ epicsError: "gh: rate limited" }),
  );
  assert.match(html, /Some data could not be read/);
  assert.match(html, /could not read open epics/);
  assert.match(html, /gh: rate limited/);
});

test("renderStatusHtml: a clean run shows no could-not-read notice at all", () => {
  const html = renderStatusHtml(baseFixture());
  assert.doesNotMatch(html, /Some data could not be read/);
});

test("renderStatusHtml: the wide PR table scrolls in its own container", () => {
  // No horizontal page scroll at 390px: the table is the only wide thing, and
  // it must carry its own overflow rather than pushing the body sideways.
  const html = renderStatusHtml(baseFixture());
  assert.match(html, /<div class="tablewrap">\s*<table>/);
});

test("renderStatusHtml: styles both colour schemes", () => {
  const html = renderStatusHtml(baseFixture());
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.match(html, /color-scheme: light dark/);
});

test("buildHealthCells: a failing scheduled workflow reaches the glance, not just a drawer", () => {
  const cells = buildHealthCells({
    workflows: [
      {
        file: "migration-drift.yml",
        label: "Migration Drift",
        found: true,
        healthy: true,
      },
      {
        file: "provider-canary.yml",
        label: "Provider canary",
        found: true,
        healthy: false,
      },
    ],
  });
  const cell = cells.find((c) => c.label === "Scheduled checks");
  assert.equal(cell.tone, "bad");
  assert.match(cell.detail, /Provider canary/);
});

test("buildHealthCells: Migration Drift is not double-counted in scheduled checks", () => {
  const cells = buildHealthCells({
    workflows: [
      {
        file: "migration-drift.yml",
        label: "Migration Drift",
        found: true,
        healthy: false,
      },
    ],
  });
  assert.equal(
    cells.find((c) => c.label === "Scheduled checks"),
    undefined,
  );
});

test("stripMarkdown: gate item markup never reaches the rendered page", () => {
  const html = renderStatusHtml(
    baseFixture({
      agentPickupQueue: [
        {
          text: "**A drafted block** can be lost in `persistenceSync.ts`",
          refLabel: "PR #840",
          url: "#",
          sourceState: "merged",
          sourceAge: "20h",
        },
      ],
    }),
  );
  assert.match(html, /A drafted block can be lost in persistenceSync\.ts/);
  assert.ok(!html.includes("**A drafted block"));
  assert.match(html, /source merged/);
});

// ---------------------------------------------------------------------------
// Escape path: every value on this page comes from GitHub (PR titles, issue
// bodies, branch names, error strings) or from a repo markdown file. None of
// it is trusted. Escaping happens exactly ONCE, at the point of insertion --
// a rule worth pinning, because the first real render shipped a double-escape
// bug ("&lt;1h ago" printed literally) which is the same rule broken the
// other way.
//
// This drives a hostile payload through every GitHub-sourced field at once
// and asserts none of it survives as live markup.
// ---------------------------------------------------------------------------

const XSS = "<script>alert(1)</script>";
const BREAKOUT = '"><img src=x onerror=alert(1)>';

test("renderStatusHtml: hostile text in any GitHub-sourced field is escaped, never live markup", () => {
  const html = renderStatusHtml({
    generatedAt: `2026-08-06T12:00:00.000Z${XSS}`,
    ghAvailable: true,
    ghError: null,
    ownerQueue: [
      {
        text: `gate ${XSS}`,
        refLabel: `Issue ${BREAKOUT}`,
        url: `https://example.invalid/${BREAKOUT}`,
        sourceState: "open",
        sourceAge: XSS,
      },
      `merge PR #1 ${XSS}`,
    ],
    prs: [
      {
        number: 1,
        title: `PR title ${XSS}`,
        author: `author${BREAKOUT}`,
        status: "green",
        isDraft: false,
        url: `https://example.invalid/${BREAKOUT}`,
        awaiting: true,
      },
    ],
    prsError: null,
    lanes: {
      mode: "usability-enjoyability",
      groups: {
        usability: [
          {
            number: 2,
            title: `issue ${XSS}`,
            labels: [`label${BREAKOUT}`],
            url: `https://example.invalid/${BREAKOUT}`,
          },
        ],
        enjoyability: [],
      },
    },
    issuesError: null,
    workflows: [
      {
        file: "provider-canary.yml",
        label: `wf ${XSS}`,
        found: true,
        healthy: false,
        conclusion: `fail ${XSS}`,
        age: XSS,
      },
    ],
    mainFreshness: {
      branch: `branch${BREAKOUT}`,
      headSha: XSS,
      headDate: XSS,
      originSha: XSS,
      originDate: XSS,
      aheadOfOrigin: 1,
    },
    coherence: {
      featureCount: 1,
      edgeCount: 1,
      unresolvedCount: 0,
      error: null,
    },
    drift: {
      found: true,
      red: false,
      conclusion: `ok ${XSS}`,
      age: XSS,
      error: null,
    },
    mainHealth: {
      runs: [
        { name: `run ${XSS}`, status: "completed", conclusion: "failure" },
      ],
      error: null,
    },
    program: {
      campaigns: [
        {
          id: "C1",
          name: `camp ${XSS}`,
          detail: `detail ${XSS}`,
          state: "in-flight",
        },
      ],
      latestNote: { date: "2026-08-06", text: `note ${XSS}` },
      campaignsPath: `docs/${BREAKOUT}`,
      campaignsAge: XSS,
      slices: [{ id: "S0", name: `slice ${XSS}`, detail: XSS }],
      slicesPath: `docs/${BREAKOUT}`,
      slicesAge: XSS,
      slicesCampaign: `C1 ${XSS}`,
    },
    allIssues: [
      {
        number: 3,
        title: `all ${XSS}`,
        state: "OPEN",
        labels: [`l${BREAKOUT}`],
        url: `https://example.invalid/${BREAKOUT}`,
        createdAt: "2026-08-01T00:00:00Z",
        closedAt: null,
      },
    ],
    allIssuesError: null,
    plans: [
      {
        path: `docs/${XSS}`,
        status: `STATUS ${XSS}`,
        complete: false,
        url: `https://example.invalid/${BREAKOUT}`,
      },
    ],
    plansError: null,
    agentPickupQueue: [
      {
        text: `todo ${XSS}`,
        refLabel: `PR ${BREAKOUT}`,
        url: `https://example.invalid/${BREAKOUT}`,
        sourceState: "merged",
        sourceAge: XSS,
      },
    ],
    gateItemsError: `err ${XSS}`,
    epicsError: `err ${XSS}`,
    pipelineError: `err ${XSS}`,
  });

  // The payload must never appear as live markup anywhere in the document.
  // Note the invariant is about MARKUP, not about the substring: the words
  // "onerror=alert(1)" legitimately survive as inert escaped text, because
  // nothing on this page is ever silently dropped. What must not exist is an
  // unescaped tag or an attribute breakout.
  assert.ok(!html.includes(XSS), "raw <script> payload leaked into the page");
  assert.ok(!html.includes("<img"), "an img tag was created from input");
  assert.ok(
    !html.includes('"><img'),
    "attribute breakout leaked into the page",
  );

  // ...and it must still be VISIBLE, escaped -- never silently dropped.
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.ok(
    html.includes("&lt;img src=x onerror=alert(1)&gt;"),
    "the breakout payload should survive as escaped, readable text",
  );

  // The page's own inline filter script is the only real <script> block.
  assert.equal(html.match(/<script>/g).length, 1);
});

test("escapeHtml: escaping is applied exactly once, not twice", () => {
  // Guards the defect this page actually shipped: a health-cell detail was
  // escaped by its builder AND again by the renderer, printing "&lt;1h ago".
  const html = renderStatusHtml(
    baseFixture({
      drift: {
        found: true,
        red: false,
        conclusion: "success",
        age: "<1h",
        error: null,
      },
    }),
  );
  assert.match(html, /drift check success, &lt;1h ago/);
  assert.ok(!html.includes("&amp;lt;1h"), "detail was escaped twice");
});

// ---------------------------------------------------------------------------
// Campaign source-of-truth drift guard (owner decision 2026-08-06, PR #848
// gate b).
//
// docs/program/campaigns.json is the machine-readable source of truth: the
// work map reads it and nothing else for campaign state. final-ux-loop.md
// section 4 keeps the human-readable list. Two files holding the same facts
// is exactly how a map starts lying, so this test fails the build the moment
// they disagree on ids, names, or states.
//
// It deliberately compares ONLY the structured facts. The prose summary in
// each file is allowed to differ -- the markdown carries rationale the JSON
// does not.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function readCampaignsJson() {
  return JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, "docs", "program", "campaigns.json"),
      "utf8",
    ),
  );
}

function readProgramMarkdown() {
  return readFileSync(
    path.join(REPO_ROOT, "docs", "program", "final-ux-loop.md"),
    "utf8",
  );
}

// The markdown states are prose; map them onto the JSON vocabulary.
function markdownStateOf(campaign) {
  return campaign.state;
}

test("campaigns.json and final-ux-loop.md section 4 agree on every campaign", () => {
  const json = readCampaignsJson();
  const fromMarkdown = parseCampaigns(readProgramMarkdown());

  assert.ok(
    fromMarkdown.length > 0,
    "section 4 of final-ux-loop.md produced no campaigns -- either the doc moved or the parser broke",
  );
  assert.equal(
    json.campaigns.length,
    fromMarkdown.length,
    `campaigns.json lists ${json.campaigns.length} campaigns, final-ux-loop.md section 4 lists ${fromMarkdown.length}`,
  );

  for (const [i, expected] of fromMarkdown.entries()) {
    const actual = json.campaigns[i];
    assert.equal(
      actual.id,
      expected.id,
      `campaign ${i + 1}: campaigns.json says ${actual.id}, the doc says ${expected.id}`,
    );
    assert.equal(
      actual.name,
      expected.name,
      `${expected.id}: campaigns.json name "${actual.name}" != doc name "${expected.name}"`,
    );
    assert.equal(
      markdownStateOf(actual),
      expected.state,
      `${expected.id}: campaigns.json state "${actual.state}" != doc state "${expected.state}" -- update both in the same PR`,
    );
  }
});

test("campaigns.json uses only the states it declares", () => {
  const json = readCampaignsJson();
  const campaignStates = new Set(json.campaign_states);
  const sliceStates = new Set(json.slice_states);
  for (const campaign of json.campaigns) {
    assert.ok(
      campaignStates.has(campaign.state),
      `${campaign.id} has undeclared state "${campaign.state}"`,
    );
    for (const slice of campaign.slices ?? []) {
      assert.ok(
        sliceStates.has(slice.state),
        `${campaign.id}/${slice.id} has undeclared state "${slice.state}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Slice-level drift guards (2026-08-29). The two tests above only ever
// compared campaign-level id/name/state between campaigns.json and
// final-ux-loop.md section 4 -- neither file's SLICE rows were checked
// against anything. That let campaigns.json's C2 slice list go stale for
// three weeks: S4-S6 sat at "in-flight"/"queued" after merging, and S7-S13
// were merged (PRs #889-#911) while campaigns.json never grew rows for them
// at all -- a missing row, not just a wrong one, and the ONLY guard gap this
// PR closes that a doc-vs-doc comparison structurally cannot: final-ux-loop.md
// stopped logging slice merges at S6 too, so comparing the two docs to each
// other would have found nothing.
// ---------------------------------------------------------------------------

test("extractCampaignSliceRefs: pulls every Final UX Loop campaign-slice mention from raw git log text", () => {
  const fixture = [
    "Final UX Loop C2-S4 — Health surface ported to moments language (#846)",
    "",
    "fix: settings quick links carry their area (#891)",
    "",
    "Final UX Loop C2-S9 (#687 round-3 fresh-eyes judge, score 8.0).",
    "some body text mentioning Final UX Loop C2-S9 again should not duplicate",
    "",
    "Final UX Loop C2-S12A — shortcuts survive a click (#906)",
    "",
    "docs: unrelated commit touching Final UX Loop docs but no campaign-slice id",
  ].join("\n");

  const refs = extractCampaignSliceRefs(fixture);
  assert.deepEqual(refs, [
    { campaignId: "C2", sliceId: "S4" },
    { campaignId: "C2", sliceId: "S9" },
    { campaignId: "C2", sliceId: "S12A" },
  ]);
});

test("extractCampaignSliceRefs: empty or non-string input yields no refs, never a throw", () => {
  assert.deepEqual(extractCampaignSliceRefs(""), []);
  assert.deepEqual(extractCampaignSliceRefs(undefined), []);
  assert.deepEqual(extractCampaignSliceRefs(null), []);
});

test("campaigns.json: a campaign's slices are sequential -- a later slice can't be merged/done while an earlier one still isn't", () => {
  // Sequential lanes are the documented design (campaign-c2-structure.md:
  // "Slices (sequential lanes; re-score closes the campaign)"), so this reads
  // it back as an invariant instead of trusting prose. Planted-violation
  // proof (see PR description): setting S9 back to "queued" while S11-S13
  // stay "merged" makes this fail; reverting makes it pass again.
  const TERMINAL = new Set(["done", "merged"]);
  const json = readCampaignsJson();
  for (const campaign of json.campaigns) {
    const slices = campaign.slices ?? [];
    let sawNonTerminal = false;
    for (const slice of slices) {
      const isTerminal = TERMINAL.has(slice.state);
      if (!isTerminal) {
        sawNonTerminal = true;
        continue;
      }
      assert.ok(
        !sawNonTerminal,
        `${campaign.id}/${slice.id} is "${slice.state}" but an earlier slice in the list is not done/merged yet -- ` +
          `slices are sequential lanes, so a later one can't finish first. Fix the earlier slice's state or reorder.`,
      );
    }
  }
});

test("campaigns.json: every campaign-slice a merge commit claims is a row in this file (git-history cross-check)", () => {
  // The one check in this file that does not compare campaigns.json against
  // ANOTHER DOCUMENT -- it compares against git history, which is what
  // actually happened. Every real slice-merge commit for this program states
  // "Final UX Loop <campaign>-<slice>" in its subject or body (verified
  // 2026-08-29 against #803-#911); if history claims a slice and this file's
  // slice list has no row for it, campaigns.json is lying by omission, which
  // is exactly the class of drift #848's original self-test could not see.
  const commitCount = gitCommitCount();
  // Vacuity floor: a shallow checkout (actions/checkout default, fetch-depth
  // 1) would make gitLogAllMessages() return almost nothing, and this test
  // would then pass by finding zero claims to check -- green while blind,
  // the same failure mode semgrep's `paths.scanned` guard and depcruise's
  // module-count floor exist to catch elsewhere in this repo's CI. Fail
  // loudly instead of silently approving an unchecked file. This repo has
  // 700+ commits on main as of 2026-08-29; 200 is a floor with headroom, not
  // a tight pin.
  assert.ok(
    commitCount >= 200,
    `git history only has ${commitCount} commit(s) visible -- this checkout is too shallow for the git-history ` +
      `cross-check to mean anything (needs fetch-depth: 0 in the CI job that runs this file). Refusing to pass a ` +
      `check that would otherwise be scanning nothing.`,
  );

  const claimed = extractCampaignSliceRefs(gitLogAllMessages());
  assert.ok(
    claimed.length > 0,
    "git history was readable (commit count check passed) but zero Final UX Loop campaign-slice mentions were " +
      "found -- the commit-message convention this check relies on may have changed; update the regex, don't ignore this.",
  );

  const json = readCampaignsJson();
  const knownIdsByCampaign = new Map(
    json.campaigns.map((c) => [
      c.id,
      new Set((c.slices ?? []).map((s) => s.id)),
    ]),
  );
  for (const { campaignId, sliceId } of claimed) {
    const known = knownIdsByCampaign.get(campaignId);
    if (!known) continue; // a merge commit for a campaign this file doesn't list at all is a different (bigger) problem, caught by the campaign-agreement test above
    assert.ok(
      known.has(sliceId),
      `a git commit claims "Final UX Loop ${campaignId}-${sliceId}" was done, but campaigns.json's ${campaignId} ` +
        `slice list has no "${sliceId}" row -- the file doesn't know this slice exists.`,
    );
  }
});

test("exactly one campaign is in flight", () => {
  const json = readCampaignsJson();
  const inFlight = json.campaigns.filter((c) => c.state === "in-flight");
  assert.equal(
    inFlight.length,
    1,
    `expected exactly one in-flight campaign, found ${inFlight.length}: ${inFlight.map((c) => c.id).join(", ")}`,
  );
});

test("renderStatusHtml: slice states from campaigns.json are shown and the current one is marked", () => {
  const html = renderStatusHtml(
    baseFixture({
      program: {
        campaigns: [
          {
            id: "C2",
            name: "Structure & navigation",
            state: "in-flight",
            detail: "one shell",
          },
        ],
        campaignsPath: "docs/program/campaigns.json",
        campaignsAge: "1h",
        slicesPath: "docs/program/campaigns.json",
        slicesAge: "1h",
        slicesCampaign: "C2 Structure & navigation",
        slices: [
          { id: "S2", name: "Port Plan/calendar", state: "merged", ref: 840 },
          { id: "S4", name: "Port Health", state: "in-flight", ref: null },
          { id: "S5", name: "Port All-areas", state: "queued", ref: null },
        ],
      },
    }),
  );
  assert.match(html, /slice slice-in-flight/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Port Health/);
  assert.match(html, /#840/);
  // The old behaviour -- refusing to show slice state because the doc was not
  // authoritative -- is gone now that a source of truth exists.
  assert.ok(!html.includes("no per-slice state is shown here"));
});

test("partitionOwnerQueue: a RED migration drift outranks the merge queue", () => {
  // Owner decision 2026-08-06 (gate c). Prod being behind main beats merging.
  const { live } = partitionOwnerQueue([
    "merge PR #42 (green, non-draft)",
    "apply pending prod migrations (Migration Drift RED): pnpm drift:assemble <files>",
    { text: "a gate", refLabel: "Issue #1", sourceState: "open" },
  ]);
  assert.deepEqual(
    live.map((entry) => entry.kind),
    ["gate", "drift", "merge"],
  );
});

test("buildHealthCells: a queued drift run reads unknown, never up-to-date", () => {
  // A run that has not finished must not claim prod is current. This is the
  // false all-clear class again: red === false is not the same as green.
  const cells = buildHealthCells({
    drift: {
      found: true,
      red: false,
      conclusion: "queued",
      age: "<1h",
      error: null,
    },
  });
  const cell = cells.find((c) => c.label === "Prod database");
  assert.equal(cell.tone, "unknown");
  assert.match(cell.verdict, /still running/);
});

test("buildHealthCells: only a settled successful drift run claims up to date", () => {
  for (const conclusion of ["success", "skipped"]) {
    const cells = buildHealthCells({
      drift: { found: true, red: false, conclusion, age: "1h", error: null },
    });
    const cell = cells.find((c) => c.label === "Prod database");
    assert.equal(cell.tone, "ok", conclusion + " should read ok");
    assert.match(cell.verdict, /up to date with main/);
  }
});
