#!/usr/bin/env node
// Purpose: the work map's HTML rendering half. Split out of status.mjs on
// 2026-08-05 so that file's terminal/text report and this page can be read --
// and diffed -- independently. status.mjs imports from here; this file must
// never import status.mjs back (no cycle), so the small shared pure helpers
// (escapeHtml, ageFromNow) live here and are re-exported there.
//
// Everything in this file is PURE: string building and markdown parsing only,
// no `gh`, no git, no filesystem. All I/O stays in status.mjs's
// gatherHtmlStatusData(). That keeps the page unit-testable from fixtures
// (scripts/agent/status.test.mjs).
//
// Design doctrine this page is built to (owner-recorded, 2026-08-05):
//   1. Map-first -- the first screenful is a glanceable map, not a wall of
//      text.
//   2. Progressive disclosure -- glance, then detail, then deep. Plain words.
//      Nothing is ever TRUNCATED to fit; deep detail moves behind <details>.
//   3. From the first screenful alone: what needs the owner now (ranked, five
//      shown), whether the system is healthy, and where the program stands.
//   4. Owner items are separated from agent-facing queues, which come after
//      and start collapsed.

// ---------------------------------------------------------------------------
// Shared pure helpers (also used by the text report in status.mjs)
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ageFromNow(isoDate) {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = ms / 36e5;
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// Deterministic, locale-independent stamp. `toLocaleString` would make the
// rendered page vary by machine and break fixture tests, so this formats the
// ISO string by hand in UTC.
function formatGeneratedAt(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

// ---------------------------------------------------------------------------
// Program docs -- markdown parsing
//
// There is no machine-readable campaign source in this repo (verified
// 2026-08-05: no milestones, no campaign labels, no JSON manifest). The
// canonical prose list is docs/program/final-ux-loop.md section 4, which
// self-declares "This list is the canonical one". We parse the campaign id,
// name, and state from it and show the rest of each bullet VERBATIM behind an
// expander -- a quote cannot drift the way a re-worded summary can. Every
// parsed block is stamped with its file path and last-changed age so the
// reader can judge the freshness themselves.
// ---------------------------------------------------------------------------

// Pure: parses the "## 4. Campaigns" bullet list. Returns [] when the section
// or its bullets are absent, so a doc rewrite degrades to "not found" rather
// than to a wrong answer.
function parseCampaigns(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) return [];
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => /^##\s*4\.\s*Campaigns/i.test(line));
  if (start === -1) return [];

  const campaigns = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s/.test(line)) break; // next section: stop.
    const match = line.match(
      /^-\s+\*\*(C\d+)\s+([^*]+?)\*\*\s*(?:—|--)?\s*(.*)$/,
    );
    if (!match) continue;
    const [, id, name, rest] = match;
    let state = "queued";
    if (/\bCLOSED\b/.test(rest)) state = "closed";
    else if (/\bIN FLIGHT\b/i.test(rest)) state = "in-flight";
    campaigns.push({ id, name: name.trim(), detail: rest.trim(), state });
  }
  return campaigns;
}

// Pure: parses the slice bullet list out of a campaign slice plan. Deliberately
// captures the slice id and its FULL bullet text only -- it does NOT derive a
// per-slice state. campaign-c2-structure.md says in its own header that "Live
// slice state is tracked in docs/program/final-ux-loop.md section 6", and on
// 2026-08-05 its S2/S3 lines were provably out of date. Restating a state the
// document itself disclaims is exactly the staleness this page exists to stop.
function parseSlices(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) return [];
  const slices = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^-\s+\*\*(S\d+|RE-SCORE)\b([^*]*)\*\*\s*(.*)$/);
    if (!match) continue;
    const [, id, namePart, rest] = match;
    const name = namePart.replace(/^\s*(?:—|--|-)\s*/, "").trim();
    slices.push({ id, name, detail: rest.trim() });
  }
  return slices;
}

// Pure: the newest dated bullet under "## 6. Program state" -- the doc's own
// live-state channel, and where campaign-c2-structure.md points for slice
// truth. Returns null when absent.
function parseLatestProgramNote(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) return null;
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) =>
    /^##\s*6\.\s*Program state/i.test(line),
  );
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    const match = lines[i].match(
      /^-\s+\*\*(\d{4}-\d{2}-\d{2})\s*(?:—|--)?\s*(.*)$/,
    );
    if (match) {
      return { date: match[1], text: match[2].trim() };
    }
  }
  return null;
}

// Pure: turns a markdown fragment into the plain sentence it means. The doc
// bullets are quoted verbatim on the page, but their markup is not content --
// leaving it in rendered a stray "resumed:**" on the real map.
function stripMarkdown(text) {
  return String(text ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> their text
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/`([^`]+)`/g, "$1") // code spans
    .replace(/(\*\*|__|`)/g, "") // any unpaired leftovers
    .replace(/\s+/g, " ")
    .trim();
}

// Pure: the first sentence of a long note, for the glance line. The full text
// is always rendered too (behind an expander) -- this is disclosure, not
// truncation. Returns { lead, hasMore }.
function leadSentence(text) {
  const flat = stripMarkdown(text);
  const match = flat.match(/^(.{0,180}?[.:!?])(\s|$)/);
  if (match && match[1].length < flat.length) {
    return { lead: match[1], hasMore: true };
  }
  if (flat.length > 200) {
    return { lead: `${flat.slice(0, 200)}…`, hasMore: true };
  }
  return { lead: flat, hasMore: false };
}

// ---------------------------------------------------------------------------
// Owner queue -- truth rules
//
// The queue used to be one flat list that mixed live asks with items scraped
// from PR bodies that had since been merged, so a dead ask lingered forever
// (2026-08-05 owner report: "resolve revert PR #806" was still listed days
// after #806 closed). Two rules fix that, and neither DROPS anything:
//
//   1. An item whose SOURCE issue/PR is closed or merged is demoted into a
//      separate, collapsed "possibly stale" group, labelled with its source
//      and age. Never deleted -- the owner still sees it, just not mixed in
//      with live work.
//   2. What remains is ranked: owner gates, then the merge queue, then
//      everything else to act on or investigate.
//
// Both rules live HERE, in the render layer. buildGateQueues() and
// buildSuggestedActions() in status.mjs keep returning exactly what they
// returned before, because the terminal report consumes them and must stay
// byte-compatible.
// ---------------------------------------------------------------------------

const QUEUE_RANK = {
  gate: 1,
  merge: 2,
  drift: 3,
  investigate: 4,
  epic: 5,
  other: 6,
};

// Pure: what kind of owner action is this, and is its source still live?
// Gate items arrive as objects carrying their source; suggested actions arrive
// as plain strings built by buildSuggestedActions(), whose exact wording is a
// stable contract with the text report.
function classifyOwnerItem(item) {
  if (item && typeof item === "object") {
    const state = String(item.sourceState ?? "").toLowerCase();
    const stale = state === "closed" || state === "merged";
    return { kind: stale ? "stale" : "gate", stale };
  }
  const text = String(item ?? "");
  if (/^merge PR #/.test(text)) return { kind: "merge", stale: false };
  if (/Migration Drift RED/.test(text)) return { kind: "drift", stale: false };
  if (/^investigate /.test(text)) return { kind: "investigate", stale: false };
  if (/^close epic /.test(text)) return { kind: "epic", stale: false };
  return { kind: "other", stale: false };
}

// Pure: splits the raw ownerQueue into the live ranked queue and the demoted
// stale group. Order within a rank is preserved (stable sort), so the text
// report's ordering still shows through inside each tier.
function partitionOwnerQueue(ownerQueue) {
  const live = [];
  const stale = [];
  for (const item of ownerQueue ?? []) {
    const { kind, stale: isStale } = classifyOwnerItem(item);
    if (isStale) {
      stale.push({ item, kind });
    } else {
      live.push({ item, kind, rank: QUEUE_RANK[kind] ?? QUEUE_RANK.other });
    }
  }
  live.sort((a, b) => a.rank - b.rank);
  return { live, stale };
}

const QUEUE_KIND_LABEL = {
  gate: "your decision",
  merge: "merge",
  drift: "prod database",
  investigate: "look into",
  epic: "housekeeping",
  other: "action",
};

// ---------------------------------------------------------------------------
// Small render helpers
// ---------------------------------------------------------------------------

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

function issueStateBadge(state) {
  return state === "OPEN"
    ? '<span class="badge badge-open">open</span>'
    : '<span class="badge badge-closed">closed</span>';
}

function dot(tone) {
  return `<span class="dot dot-${tone}" aria-hidden="true"></span>`;
}

function drawer(id, summary, count, body, { open = false } = {}) {
  const countHtml =
    count == null
      ? ""
      : `<span class="drawer-count">${escapeHtml(count)}</span>`;
  return `<details class="drawer" id="${escapeHtml(id)}"${open ? " open" : ""}>
      <summary><span class="drawer-title">${escapeHtml(summary)}</span>${countHtml}</summary>
      <div class="drawer-body">${body}</div>
    </details>`;
}

function renderSourceLink(item) {
  if (!item || typeof item !== "object" || !item.refLabel) return "";
  return `<a href="${escapeHtml(item.url ?? "#")}">${escapeHtml(item.refLabel)}</a>`;
}

function renderIssueCards(issues) {
  if (!issues || issues.length === 0) {
    return '<p class="dim">Nothing open here.</p>';
  }
  return `<ul class="rows">${issues
    .map(
      (issue) => `<li class="row">
        <b><a href="${escapeHtml(issue.url ?? "#")}">#${issue.number}</a> ${escapeHtml(issue.title)}</b>
        <span class="dim">${issue.labels.map(escapeHtml).join(", ") || "no labels"}</span>
      </li>`,
    )
    .join("\n")}</ul>`;
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

// ---------------------------------------------------------------------------
// Health strip -- doctrine 3(b): is the system healthy, at a glance?
// Four plain-language verdicts. "unknown" is a real, visible answer here; a
// missing signal must never read as a healthy one.
// ---------------------------------------------------------------------------

function buildHealthCells(data) {
  const cells = [];

  const mainHealth = data.mainHealth ?? {};
  if (mainHealth.error) {
    cells.push({
      label: "Main branch",
      tone: "unknown",
      verdict: "could not check",
      detail: mainHealth.error,
    });
  } else {
    const runs = mainHealth.runs ?? [];
    const failing = runs.filter(
      (run) =>
        run.status === "completed" &&
        run.conclusion !== "success" &&
        run.conclusion !== "skipped",
    );
    const running = runs.filter((run) => run.status !== "completed");
    if (runs.length === 0) {
      cells.push({
        label: "Main branch",
        tone: "unknown",
        verdict: "no recent runs",
        detail: "nothing has run on main lately",
      });
    } else if (failing.length > 0) {
      cells.push({
        label: "Main branch",
        tone: "bad",
        verdict:
          failing.length === 1
            ? "1 run is failing"
            : `${failing.length} runs are failing`,
        detail: failing.map((run) => run.name).join(", "),
      });
    } else {
      cells.push({
        label: "Main branch",
        tone: "ok",
        verdict: "all recent runs passed",
        detail:
          running.length > 0
            ? `${running.length} still running`
            : `last ${runs.length} runs`,
      });
    }
  }

  const coherence = data.coherence ?? {};
  if (coherence.error) {
    cells.push({
      label: "Guards",
      tone: "unknown",
      verdict: "could not check",
      detail: coherence.error,
    });
  } else if (typeof coherence.unresolvedCount === "number") {
    const quiet = coherence.unresolvedCount === 0;
    cells.push({
      label: "Guards",
      tone: quiet ? "ok" : "bad",
      verdict: quiet ? "quiet" : `${coherence.unresolvedCount} unresolved`,
      detail: `${coherence.featureCount} features, ${coherence.edgeCount} links checked`,
    });
  }

  const drift = data.drift ?? {};
  if (drift.error) {
    cells.push({
      label: "Prod database",
      tone: "unknown",
      verdict: "could not check",
      detail: drift.error,
    });
  } else if (drift.found === false) {
    cells.push({
      label: "Prod database",
      tone: "unknown",
      verdict: "never checked",
      detail: "no Migration Drift runs found",
    });
  } else if (drift.found) {
    cells.push({
      label: "Prod database",
      tone: drift.red ? "bad" : "ok",
      verdict: drift.red ? "behind main" : "up to date with main",
      // Not escaped here: renderHealthStrip escapes every field once. Escaping
      // twice is what printed a literal "&lt;1h ago" on the first real render.
      detail: `drift check ${drift.conclusion ?? "?"}, ${drift.age ?? "?"} ago`,
    });
  }

  // Scheduled workflows run off main's push cycle, so a failing one can sit
  // outside the "last 8 runs on main" window and never reach the glance. That
  // is a false all-clear -- the same class of bug as issue #758. Migration
  // Drift is excluded here because it already has its own cell above.
  const workflows = (data.workflows ?? []).filter(
    (wf) => wf.file !== "migration-drift.yml",
  );
  if (workflows.length > 0) {
    const broken = workflows.filter((wf) => wf.found && !wf.healthy);
    const unreadable = workflows.filter((wf) => wf.error || !wf.found);
    if (broken.length > 0) {
      cells.push({
        label: "Scheduled checks",
        tone: "bad",
        verdict:
          broken.length === 1 ? "1 is failing" : `${broken.length} are failing`,
        detail: broken.map((wf) => wf.label).join(", "),
      });
    } else if (unreadable.length === workflows.length) {
      cells.push({
        label: "Scheduled checks",
        tone: "unknown",
        verdict: "could not check",
        detail: unreadable.map((wf) => wf.label).join(", "),
      });
    } else {
      cells.push({
        label: "Scheduled checks",
        tone: "ok",
        verdict: "all passing",
        detail: `${workflows.length - unreadable.length} of ${workflows.length} readable`,
      });
    }
  }

  const freshness = data.mainFreshness ?? {};
  if (freshness.error) {
    cells.push({
      label: "This checkout",
      tone: "unknown",
      verdict: "could not check",
      detail: freshness.error,
    });
  } else if (typeof freshness.aheadOfOrigin === "number") {
    const ahead = freshness.aheadOfOrigin;
    cells.push({
      label: "This checkout",
      tone: ahead === 0 ? "ok" : "warn",
      verdict:
        ahead === 0
          ? "matches origin/main"
          : `${ahead} commit${ahead === 1 ? "" : "s"} ahead`,
      detail: `${freshness.branch ?? "?"} at ${freshness.headSha ?? "?"}`,
    });
  } else {
    cells.push({
      label: "This checkout",
      tone: "unknown",
      verdict: "cannot compare",
      detail: "origin/main ref not available locally",
    });
  }

  return cells;
}

function renderHealthStrip(cells) {
  if (cells.length === 0) {
    return '<p class="dim">No health signals could be read.</p>';
  }
  return `<div class="health">${cells
    .map(
      (cell) => `<div class="health-cell">
        <span class="health-label">${escapeHtml(cell.label)}</span>
        <span class="health-verdict">${dot(cell.tone)}${escapeHtml(cell.verdict)}</span>
        <span class="health-detail dim">${escapeHtml(cell.detail ?? "")}</span>
      </div>`,
    )
    .join("\n")}</div>`;
}

// ---------------------------------------------------------------------------
// Campaign strip -- doctrine 3(c): where does the program stand?
// ---------------------------------------------------------------------------

const CAMPAIGN_STATE_LABEL = {
  closed: "done",
  "in-flight": "in flight",
  queued: "later",
};

function renderCampaignStrip(program) {
  const campaigns = program?.campaigns ?? [];
  if (campaigns.length === 0) {
    const reason =
      program?.error ??
      "no campaign list found in docs/program/final-ux-loop.md section 4";
    return `<p class="dim">Program state unavailable: ${escapeHtml(reason)}</p>`;
  }

  const done = campaigns.filter((c) => c.state === "closed").length;
  const current = campaigns.find((c) => c.state === "in-flight");

  const chips = campaigns
    .map(
      (campaign) => `<div class="camp camp-${campaign.state}"${
        campaign.state === "in-flight" ? ' aria-current="step"' : ""
      }>
        <span class="camp-id">${escapeHtml(campaign.id)}</span>
        <span class="camp-name">${escapeHtml(campaign.name)}</span>
        <span class="camp-state">${dot(
          campaign.state === "closed"
            ? "ok"
            : campaign.state === "in-flight"
              ? "current"
              : "idle",
        )}${escapeHtml(CAMPAIGN_STATE_LABEL[campaign.state] ?? campaign.state)}</span>
      </div>`,
    )
    .join("\n");

  const summary = current
    ? `${done} of ${campaigns.length} done. <b>${escapeHtml(current.id)} ${escapeHtml(current.name)}</b> is in flight.`
    : `${done} of ${campaigns.length} done. Nothing marked in flight.`;

  const note = program.latestNote;
  const noteHtml = note
    ? (() => {
        const { lead, hasMore } = leadSentence(note.text);
        return `<p class="prog-note"><span class="prog-note-date">${escapeHtml(note.date)}</span> ${escapeHtml(lead)}${
          hasMore ? ' <span class="dim">(full note below)</span>' : ""
        }</p>`;
      })()
    : "";

  const detailBody = `
    <p class="dim src">Read from <code>${escapeHtml(program.campaignsPath ?? "?")}</code> section 4, last changed ${escapeHtml(program.campaignsAge ?? "?")} ago. The wording below is the file's own, quoted unchanged.</p>
    <ul class="rows">${campaigns
      .map(
        (campaign) => `<li class="row">
          <b>${escapeHtml(campaign.id)} ${escapeHtml(campaign.name)} <span class="tag tag-${campaign.state}">${escapeHtml(CAMPAIGN_STATE_LABEL[campaign.state] ?? campaign.state)}</span></b>
          <span class="dim">${escapeHtml(stripMarkdown(campaign.detail))}</span>
        </li>`,
      )
      .join("\n")}</ul>
    ${
      note
        ? `<h3 class="sub-h">Latest program note (${escapeHtml(note.date)})</h3>
           <p class="dim src">From the same file, section 6 &mdash; the doc's own live-state channel.</p>
           <p>${escapeHtml(stripMarkdown(note.text))}</p>`
        : ""
    }
    ${renderSlicePlan(program)}`;

  return `<div class="camp-strip">${chips}</div>
    <p class="camp-summary">${summary}</p>
    ${noteHtml}
    ${drawer("campaign-detail", "What each campaign covers", null, detailBody)}`;
}

function renderSlicePlan(program) {
  const slices = program?.slices ?? [];
  if (slices.length === 0) return "";
  return `<h3 class="sub-h">${escapeHtml(program.slicesCampaign ?? "Current campaign")} slice plan</h3>
    <p class="dim src">Slice names from <code>${escapeHtml(program.slicesPath ?? "?")}</code>, last changed ${escapeHtml(program.slicesAge ?? "?")} ago. That file states its own slice states are not authoritative &mdash; it points at <code>final-ux-loop.md</code> section 6 (the note above) for live state, so no per-slice state is shown here.</p>
    <ol class="slices">${slices
      .map(
        (slice) =>
          `<li><b>${escapeHtml(slice.id)}</b> ${escapeHtml(slice.name)}</li>`,
      )
      .join("\n")}</ol>`;
}

// ---------------------------------------------------------------------------
// "Could not read" -- doctrine 2: report failures honestly, never omit them.
// ---------------------------------------------------------------------------

function collectDataProblems(data) {
  const problems = [];
  const add = (what, reason) => {
    if (reason != null && reason !== "") problems.push({ what, reason });
  };
  add("GitHub access", data.ghError);
  add("open pull requests", data.prsError);
  add("open issues", data.issuesError);
  add("all issues (full map)", data.allIssuesError);
  add("plans and ideas", data.plansError);
  add("checkbox items on issues and PRs", data.gateItemsError);
  add("open epics", data.epicsError);
  add("recent runs on main", data.mainHealth?.error);
  add("migration drift", data.drift?.error);
  add("pipeline steps", data.pipelineError);
  add("coherence guards", data.coherence?.error);
  add("program docs", data.program?.error);
  add("local git freshness", data.mainFreshness?.error);
  return problems;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

function renderOwnerQueueEntry(entry) {
  const { item, kind } = entry;
  const isObject = item && typeof item === "object";
  // Gate items are scraped out of markdown bodies. The text report prints them
  // raw (and must keep doing so), but on the page the markup is noise, not
  // content -- it rendered a literal "**A drafted block can be silently
  // lost.**" on the first real run.
  const text = stripMarkdown(isObject ? item.text : String(item));
  const meta = [];
  const link = renderSourceLink(item);
  if (link) meta.push(link);
  if (isObject && item.sourceAge) {
    meta.push(`<span class="dim">${escapeHtml(item.sourceAge)} old</span>`);
  }
  return `<li class="q-item">
      <span class="q-text">${escapeHtml(text)}</span>
      <span class="q-meta"><span class="tag tag-${escapeHtml(kind)}">${escapeHtml(
        QUEUE_KIND_LABEL[kind] ?? kind,
      )}</span>${meta.length > 0 ? ` ${meta.join(' <span class="sep">&middot;</span> ')}` : ""}</span>
    </li>`;
}

const OWNER_QUEUE_VISIBLE = 5;

// Pure: string-building only, no I/O. Takes the shape produced by
// gatherHtmlStatusData() (or an equivalent fixture in tests).
function renderStatusHtml(data) {
  const generatedLabel = escapeHtml(data.generatedAt);
  const generatedFriendly = escapeHtml(formatGeneratedAt(data.generatedAt));

  const ghUnavailableSection = !data.ghAvailable
    ? `<div class="notice notice-bad">
        <b>GitHub data unavailable</b>
        <p>${escapeHtml(data.ghError ?? "unknown reason")}</p>
        <p class="dim">Re-run once <code>gh auth status</code> succeeds to get live PRs, issues, and workflow health.</p>
      </div>`
    : "";

  // -- Waiting on you ------------------------------------------------------
  const { live: liveQueue, stale: staleQueue } = partitionOwnerQueue(
    data.ownerQueue,
  );
  const shown = liveQueue.slice(0, OWNER_QUEUE_VISIBLE);
  const overflow = liveQueue.slice(OWNER_QUEUE_VISIBLE);

  const ownerQueueItems =
    liveQueue.length === 0
      ? '<li class="q-item q-empty">Nothing waiting on you right now.</li>'
      : shown.map(renderOwnerQueueEntry).join("\n");

  const ownerQueueOverflow =
    overflow.length === 0
      ? ""
      : drawer(
          "queue-rest",
          "The rest of your queue",
          overflow.length,
          `<ol class="q-list q-list-rest" start="${OWNER_QUEUE_VISIBLE + 1}">${overflow
            .map(renderOwnerQueueEntry)
            .join("\n")}</ol>`,
        );

  // Demoted, never dropped: the source issue/PR is closed or merged, so the
  // ask is probably dead -- but only the owner can say so.
  const staleQueueHtml =
    staleQueue.length === 0
      ? ""
      : drawer(
          "queue-stale",
          "Possibly stale — the source is closed",
          staleQueue.length,
          `<p class="dim src">These unticked checkboxes come from issues or pull requests that have since been closed or merged, so the ask may already be dead. They are kept here, not deleted, until you say otherwise.</p>
           <ul class="q-list q-list-stale">${staleQueue
             .map(renderOwnerQueueEntry)
             .join("\n")}</ul>`,
        );

  // -- Agent pickup queue --------------------------------------------------
  const agentPickupQueue = data.agentPickupQueue ?? [];
  const agentPickupItems =
    agentPickupQueue.length === 0
      ? '<li class="dim">Nothing pre-classified as agent-doable right now.</li>'
      : agentPickupQueue
          .map((item) => {
            const link = renderSourceLink(item);
            // Same truth rule as the owner queue, applied here as a label: an
            // item scraped from a PR that has since merged may already be dead.
            const state = String(item.sourceState ?? "").toLowerCase();
            const staleTag =
              state === "merged" || state === "closed"
                ? ` <span class="tag">source ${escapeHtml(state)}</span>`
                : "";
            const age = item.sourceAge
              ? ` <span class="dim">${escapeHtml(item.sourceAge)} old</span>`
              : "";
            return `<li class="row"><b>${escapeHtml(stripMarkdown(item.text))}</b><span class="dim">${
              link ? link : ""
            }${age}${staleTag}</span></li>`;
          })
          .join("\n");
  const agentPickupErrorHtml =
    data.gateItemsError != null
      ? `<p class="dim">Gate item scan degraded: ${escapeHtml(data.gateItemsError)}</p>`
      : "";

  // -- Open PRs ------------------------------------------------------------
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
      ? `<div class="lane">
          <h3 class="sub-h">Usability</h3>
          ${renderIssueCards(data.lanes.groups.usability)}
        </div>
        <div class="lane">
          <h3 class="sub-h">Enjoyability</h3>
          ${renderIssueCards(data.lanes.groups.enjoyability)}
        </div>`
      : `<div class="lane lane-wide">
          <h3 class="sub-h">Open work</h3>
          ${data.issuesError != null ? `<p class="dim">Issue data unavailable: ${escapeHtml(data.issuesError)}</p>` : renderIssueCards(data.lanes.groups.open)}
        </div>`;

  const laneCount =
    data.lanes.mode === "usability-enjoyability"
      ? (data.lanes.groups.usability?.length ?? 0) +
        (data.lanes.groups.enjoyability?.length ?? 0)
      : (data.lanes.groups.open?.length ?? 0);

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

  const fullMapHtml = `<section class="block">
      <h2 class="section-title">All issues (${openCount} open / ${closedCount} closed)</h2>
      ${fullMapIssuesHtml}
    </section>

    <section class="block">
      <h2 class="section-title">Plans &amp; ideas</h2>
      ${data.plansError != null ? `<p class="dim">Plans data unavailable: ${escapeHtml(data.plansError)}</p>` : renderPlansList(data.plans)}
    </section>`;

  const problems = collectDataProblems(data);
  const problemsHtml =
    problems.length === 0
      ? ""
      : `<div class="notice notice-warn">
          ${drawer(
            "data-problems",
            "Some data could not be read",
            problems.length,
            `<ul class="rows">${problems
              .map(
                (p) =>
                  `<li class="row"><b>could not read ${escapeHtml(p.what)}</b><span class="dim">${escapeHtml(p.reason)}</span></li>`,
              )
              .join("\n")}</ul>`,
          )}
        </div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LifeOS Work Map</title>
    <style>
      /* Palette ported from the app's own tokens (apps/web/src/app/globals.css)
         so the work map reads as part of LifeOS rather than a stray report.
         Light axis: --bg #f7f6f3, --surface #fff, --ink #1d1c1a, --line #ecebe6,
         accent #6d8bff, red #cf5a54. Dark axis: --bg #14151a, --surface #1e2028,
         --ink #eef0f4, --line #2a2c36, red #e56b64.
         Colour is restrained on purpose: one accent for "current" and
         interactive, and a semantic ok/warn/bad trio used ONLY on state dots
         and badges. Hierarchy comes from spacing and weight. */
      :root {
        color-scheme: light dark;
        --bg: #f7f6f3;
        --surface: #ffffff;
        --surface-2: #f4f3ef;
        --ink: #1d1c1a;
        --ink-soft: #605d57;
        --line: #e4e2dc;
        --line-strong: #d6d3ca;
        --accent: #4a63d8;
        --accent-soft: #edf0fd;
        --ok: #2f7355;
        --warn: #7d5a17;
        --bad: #a83a33;
        --idle: #9a968d;
        --shadow: 0 1px 2px rgba(29, 28, 26, 0.06);
        --radius: 10px;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #14151a;
          --surface: #1e2028;
          --surface-2: #191b22;
          --ink: #eef0f4;
          --ink-soft: #a2a8b6;
          --line: #2a2c36;
          --line-strong: #383b48;
          --accent: #93a6ff;
          --accent-soft: #222739;
          --ok: #6fc79b;
          --warn: #e0b567;
          --bad: #e56b64;
          --idle: #6b7080;
          --shadow: none;
        }
      }

      * { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font:
          15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          sans-serif;
        overflow-wrap: break-word;
      }
      .page {
        max-width: 68rem;
        margin: 0 auto;
        padding: clamp(1.25rem, 3vw, 2.25rem) clamp(1rem, 3vw, 2rem) 4rem;
      }
      a { color: var(--accent); text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); }
      a:hover { text-decoration-color: currentColor; }
      :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.88em;
        background: var(--surface-2);
        border: 1px solid var(--line);
        border-radius: 4px;
        padding: 0.05em 0.35em;
      }
      .dim { color: var(--ink-soft); }
      .sep { color: var(--line-strong); }

      /* --- header --- */
      .masthead {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--line);
        margin-bottom: 1.75rem;
      }
      h1 { font-size: 1.35rem; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
      .masthead .stamp { color: var(--ink-soft); font-size: 0.8125rem; }

      /* --- section rhythm --- */
      .block { margin: 0 0 2.25rem; }
      .block-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.25rem 1rem;
        margin: 0 0 0.75rem;
      }
      h2.section-title {
        font-size: 1rem;
        font-weight: 620;
        margin: 0;
        letter-spacing: -0.005em;
      }
      .block-head .hint { color: var(--ink-soft); font-size: 0.8125rem; }
      h3.sub-h {
        font-size: 0.875rem;
        font-weight: 620;
        margin: 1.25rem 0 0.5rem;
        color: var(--ink);
      }
      h3.sub-h:first-child { margin-top: 0; }
      .src { font-size: 0.8125rem; margin: 0 0 0.75rem; }

      /* --- state dots + tags --- */
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex: none;
        background: var(--idle);
      }
      .dot-ok { background: var(--ok); }
      .dot-warn { background: var(--warn); }
      .dot-bad { background: var(--bad); }
      .dot-unknown { background: var(--idle); }
      .dot-current { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
      .dot-idle { background: var(--idle); }
      .tag {
        display: inline-block;
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        border: 1px solid var(--line-strong);
        color: var(--ink-soft);
        white-space: nowrap;
      }
      .tag-gate { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); color: var(--accent); background: var(--accent-soft); }
      .tag-drift { border-color: color-mix(in srgb, var(--bad) 45%, var(--line)); color: var(--bad); }
      .tag-closed { color: var(--ok); }
      .tag-in-flight { color: var(--accent); background: var(--accent-soft); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }

      /* --- health strip --- */
      /* A 1px grid gap over a --line background draws the separators, so the
         hairlines stay correct at ANY column count the grid wraps to (4-up on
         desktop, 2-up at 390px) without per-child border rules. */
      .health {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
        gap: 1px;
        background: var(--line);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .health-cell {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.6rem 0.8rem 0.65rem;
        background: var(--surface);
      }
      .health-label {
        font-size: 0.6875rem;
        font-weight: 600;
        color: var(--ink-soft);
      }
      .health-verdict {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        font-size: 0.875rem;
        font-weight: 650;
        line-height: 1.3;
      }
      /* Pin the dot to the first line's optical centre so it stays put when a
         long verdict wraps to two lines (align-self:center drifts to the
         middle of the block). */
      .health-verdict .dot { align-self: flex-start; margin-top: 0.42em; }
      .health-detail { font-size: 0.6875rem; line-height: 1.35; }

      /* --- campaign strip --- */
      .camp-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
        gap: 0.5rem;
      }
      .camp {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.7rem 0.8rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
      }
      .camp-closed { background: var(--surface-2); box-shadow: none; }
      .camp-closed .camp-name, .camp-closed .camp-id { color: var(--ink-soft); }
      .camp-in-flight {
        border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
        background: var(--accent-soft);
      }
      .camp-id { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.02em; }
      .camp-in-flight .camp-id { color: var(--accent); }
      .camp-name { font-size: 0.8125rem; line-height: 1.35; }
      /* margin-top:auto keeps the state row on a shared baseline even when one
         campaign's name wraps to two lines. */
      .camp-state {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.6875rem;
        color: var(--ink-soft);
        margin-top: auto;
        padding-top: 0.3rem;
      }
      .camp-summary { margin: 0.75rem 0 0; font-size: 0.9375rem; }
      .prog-note { margin: 0.35rem 0 0.75rem; font-size: 0.875rem; color: var(--ink-soft); }
      .prog-note-date {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--ink);
      }
      .slices { margin: 0.5rem 0 0; padding-left: 1.25rem; font-size: 0.875rem; }
      .slices li { margin: 0.2rem 0; }

      /* --- waiting on you --- */
      .q-list {
        list-style: none;
        margin: 0;
        padding: 0;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        overflow: hidden;
        counter-reset: q;
      }
      .q-item {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.3rem 0.75rem;
        padding: 0.7rem 1rem 0.7rem 2.6rem;
        border-top: 1px solid var(--line);
        position: relative;
      }
      .q-list > .q-item:first-child { border-top: 0; }
      .q-item::before {
        counter-increment: q;
        content: counter(q);
        position: absolute;
        left: 1rem;
        top: 0.72rem;
        font-size: 0.75rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--ink-soft);
      }
      .q-list-rest { counter-reset: q var(--start, 5); }
      .q-item.q-empty { padding-left: 1rem; color: var(--ink-soft); }
      .q-item.q-empty::before { content: none; }
      .q-text { flex: 1 1 22rem; font-size: 0.9375rem; }
      .q-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.4rem;
        font-size: 0.8125rem;
      }
      .q-list-stale { padding-left: 0; }
      .q-list-stale .q-item { padding-left: 1rem; }
      .q-list-stale .q-item::before { content: none; }
      .q-list-stale .q-text { color: var(--ink-soft); }

      /* --- expanders --- */
      .drawer {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        margin: 0.75rem 0 0;
      }
      .drawer > summary {
        cursor: pointer;
        list-style: none;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.6rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        border-radius: var(--radius);
      }
      .drawer > summary::-webkit-details-marker { display: none; }
      .drawer > summary::before {
        content: "";
        width: 0;
        height: 0;
        border: 4px solid transparent;
        border-left-color: var(--ink-soft);
        margin-right: 0.1rem;
        transition: transform 140ms cubic-bezier(0.22, 1, 0.36, 1);
        transform-origin: 25% 50%;
      }
      .drawer[open] > summary::before { transform: rotate(90deg); }
      .drawer > summary:hover { background: var(--surface-2); }
      .drawer-count {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ink-soft);
        background: var(--surface-2);
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0.05rem 0.45rem;
        font-variant-numeric: tabular-nums;
      }
      .drawer-body {
        padding: 0.25rem 1rem 1rem;
        border-top: 1px solid var(--line);
        padding-top: 0.85rem;
      }
      .drawer-body > :first-child { margin-top: 0; }
      .drawer-body > :last-child { margin-bottom: 0; }
      @media (prefers-reduced-motion: reduce) {
        .drawer > summary::before { transition: none; }
      }

      /* --- generic rows (issues, lanes, problems) --- */
      ul.rows { list-style: none; margin: 0; padding: 0; }
      .rows > .row {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.55rem 0;
        border-top: 1px solid var(--line);
        font-size: 0.875rem;
      }
      .rows > .row:first-child { border-top: 0; padding-top: 0; }
      .rows > .row b { font-weight: 600; }
      .rows > .row b a { color: var(--ink); }
      .rows > .row .dim { font-size: 0.8125rem; }

      .lanes { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
      @media (min-width: 46rem) { .lanes { grid-template-columns: 1fr 1fr; } }
      .lane-wide { grid-column: 1 / -1; }

      /* --- notices --- */
      .notice {
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 0.85rem 1rem;
        margin: 0 0 1.5rem;
        background: var(--surface);
      }
      .notice-bad { border-color: color-mix(in srgb, var(--bad) 45%, var(--line)); }
      .notice-bad b { color: var(--bad); }
      .notice-warn { padding: 0; border: 0; background: none; margin-bottom: 1.5rem; }
      .notice-warn .drawer { margin: 0; border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); }
      .notice p { margin: 0.35rem 0 0; }

      /* --- tables --- */
      .tablewrap {
        overflow-x: auto;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
      }
      table { width: 100%; border-collapse: collapse; min-width: 40rem; }
      th, td {
        text-align: left;
        padding: 0.55rem 0.85rem;
        border-bottom: 1px solid var(--line);
        font-size: 0.8125rem;
        vertical-align: top;
      }
      th { color: var(--ink-soft); font-weight: 600; font-size: 0.75rem; }
      tr:last-child td { border-bottom: none; }
      td a { font-variant-numeric: tabular-nums; }

      /* --- badges --- */
      .badge {
        display: inline-block;
        padding: 0.05rem 0.45rem;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 600;
        border: 1px solid var(--line-strong);
        color: var(--ink-soft);
        white-space: nowrap;
      }
      .badge-green { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); }
      .badge-red { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 45%, var(--line)); }
      .badge-pending { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, var(--line)); }
      .badge-unknown { color: var(--ink-soft); }
      .badge-open { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); }
      .badge-closed { color: var(--ink-soft); }

      /* --- workflow health --- */
      .wf-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .wf-item {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        padding: 0.5rem 0.8rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8125rem;
      }

      /* --- tabs --- */
      .tabs {
        display: flex;
        gap: 0.35rem;
        margin: 0 0 1.75rem;
        border-bottom: 1px solid var(--line);
      }
      .tab-btn {
        background: none;
        border: 0;
        border-bottom: 2px solid transparent;
        color: var(--ink-soft);
        padding: 0.5rem 0.15rem;
        margin-right: 1.15rem;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
        margin-bottom: -1px;
      }
      .tab-btn:hover { color: var(--ink); }
      .tab-btn.active { color: var(--ink); border-bottom-color: var(--accent); }
      .hidden { display: none !important; }

      /* --- full-map filters --- */
      .filter-bar { margin-bottom: 0.85rem; }
      .chip-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
      .chip {
        background: var(--surface);
        border: 1px solid var(--line-strong);
        color: var(--ink-soft);
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        font: inherit;
        font-size: 0.75rem;
        cursor: pointer;
      }
      .chip:hover { color: var(--ink); }
      .chip.active {
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
        background: var(--accent-soft);
      }
      .text-filter {
        width: 100%;
        max-width: 22rem;
        background: var(--surface);
        border: 1px solid var(--line-strong);
        color: var(--ink);
        border-radius: 8px;
        padding: 0.35rem 0.6rem;
        font: inherit;
        font-size: 0.875rem;
      }
      .text-filter::placeholder { color: var(--ink-soft); }

      .issue-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.3rem 0.6rem;
        padding: 0.55rem 0;
        border-top: 1px solid var(--line);
      }
      #issuesList .issue-row:first-child { border-top: 0; }
      .issue-row b { flex-basis: 100%; font-size: 0.875rem; font-weight: 600; }
      .issue-row b a { color: var(--ink); }
      .issue-row .dim { font-size: 0.8125rem; }
      .issue-closed b a { color: var(--ink-soft); }
      .plan-row {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.55rem 0;
        border-top: 1px solid var(--line);
        font-size: 0.875rem;
      }
      .plan-row b { font-weight: 600; }
      .plan-row b a { color: var(--ink); }
      .plan-complete b a { color: var(--ink-soft); }
      .plan-row .dim { font-size: 0.8125rem; }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="masthead">
        <h1>LifeOS work map</h1>
        <span class="stamp" title="${generatedLabel}">generated ${generatedFriendly} from live GitHub state</span>
      </div>

      <div class="tabs">
        <button type="button" class="tab-btn active" data-view="view-now">Now</button>
        <button type="button" class="tab-btn" data-view="view-full">Everything</button>
      </div>

      <div class="view" id="view-now">
        ${ghUnavailableSection}
        ${problemsHtml}

        <section class="block">
          <div class="block-head">
            <h2 class="section-title">How things are running</h2>
          </div>
          ${renderHealthStrip(buildHealthCells(data))}
        </section>

        <section class="block owner-queue">
          <div class="block-head">
            <h2 class="section-title">Waiting on you</h2>
            <span class="hint">${
              liveQueue.length === 0
                ? "nothing right now"
                : `${liveQueue.length} item${liveQueue.length === 1 ? "" : "s"}, most important first`
            }</span>
          </div>
          <ol class="q-list">${ownerQueueItems}</ol>
          ${ownerQueueOverflow}
          ${staleQueueHtml}
        </section>

        <section class="block">
          <div class="block-head">
            <h2 class="section-title">Where the program stands</h2>
          </div>
          ${renderCampaignStrip(data.program)}
        </section>

        <section class="block">
          <div class="block-head">
            <h2 class="section-title">Everything else</h2>
            <span class="hint">agent-facing detail, open by choice</span>
          </div>
          ${drawer(
            "agent-queue",
            "Work agents can pick up",
            agentPickupQueue.length,
            `${agentPickupErrorHtml}<ul class="rows agent-queue-list">${agentPickupItems}</ul>`,
          )}
          ${drawer(
            "open-prs",
            "Open pull requests",
            data.prsError != null ? "?" : data.prs.length,
            `<div class="tablewrap">
              <table>
                <thead><tr><th>PR</th><th>Title</th><th>Author</th><th>CI</th><th>State</th></tr></thead>
                <tbody>
                  ${prRows}
                </tbody>
              </table>
            </div>`,
          )}
          ${drawer(
            "backlogs",
            "Open issue backlogs",
            laneCount,
            `<div class="lanes">${lanesHtml}</div>`,
          )}
          ${drawer(
            "workflows",
            "Scheduled workflow health",
            data.workflows.length,
            `<div class="wf-row">${workflowRows}</div>`,
          )}
          ${drawer("freshness", "Repo freshness", null, freshnessHtml)}
        </section>
      </div>

      <div class="view hidden" id="view-full">
        ${fullMapHtml}
      </div>
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

export {
  escapeHtml,
  ageFromNow,
  formatGeneratedAt,
  parseCampaigns,
  parseSlices,
  parseLatestProgramNote,
  leadSentence,
  classifyOwnerItem,
  partitionOwnerQueue,
  buildHealthCells,
  collectDataProblems,
  renderStatusHtml,
};
