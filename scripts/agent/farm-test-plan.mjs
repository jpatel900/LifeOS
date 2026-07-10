#!/usr/bin/env node
// Purpose: turn the owner's marked-up scripted test plan (a markdown file whose
// steps carry ✅/⚠️/❌ verdicts) into structured findings, and optionally into
// ready-to-run `gh issue create` commands -- so farming test-plan friction into
// GitHub issues is mechanical and consistent (contract: issue #488).
//
// Usage:
//   node scripts/agent/farm-test-plan.mjs <path-to-plan.md>        # prints JSON findings
//   node scripts/agent/farm-test-plan.mjs <path-to-plan.md> --gh   # + one gh command per ⚠️/❌
//
// This script is READ-ONLY and NON-MUTATING. The `--gh` mode PRINTS the
// `gh issue create` commands; it never executes them. The parser is tolerant:
// malformed lines are skipped and counted, never thrown.
//
// Conventions mirror scripts/agent/status.mjs: pure parse/compose functions are
// separated from I/O, and an entry-point guard ensures importing this module in
// a test never runs main().

import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const REPO = "jpatel900/LifeOS";
const LABEL = "usability";
const TITLE_TEXT_MAX = 60;

// A ⚠️ can be encoded as U+26A0 alone or U+26A0 U+FE0F (variation selector);
// match the base code point so both encodings are caught.
const MARK_WARN = "⚠"; // ⚠
const MARK_BROKEN = "❌"; // ❌
const MARK_PASS = "✅"; // ✅

// --- pure helpers -----------------------------------------------------------

// Most-severe verdict present in a chunk of text: broken > friction > pass.
// Returns "broken" | "friction" | "pass" | null.
function detectVerdict(text) {
  const s = String(text ?? "");
  if (s.includes(MARK_BROKEN)) return "broken";
  if (s.includes(MARK_WARN)) return "friction";
  if (s.includes(MARK_PASS)) return "pass";
  return null;
}

function verdictMeta(verdict) {
  if (verdict === "broken") return { severity: "high", rank: 0 };
  if (verdict === "friction") return { severity: "medium", rank: 1 };
  return { severity: "unknown", rank: 9 };
}

// The free text that follows the first ⚠️/❌ mark on a line, with the variation
// selector and leading separators trimmed off.
function textAfterMark(line) {
  const s = String(line ?? "");
  let idx = -1;
  for (const mark of [MARK_BROKEN, MARK_WARN]) {
    const at = s.indexOf(mark);
    if (at !== -1 && (idx === -1 || at < idx)) idx = at;
  }
  if (idx === -1) return "";
  let rest = s.slice(idx + 1);
  // Drop a trailing variation selector and any leading separator punctuation.
  rest = rest.replace(/^[️\s:—–-]+/, "");
  return rest.trim();
}

// Cut a string at the first case-insensitive occurrence of a regexp.
function cutAt(text, re) {
  const m = re.exec(text);
  return m ? text.slice(0, m.index) : text;
}

// Remove everything from the first verdict mark onward.
function cutAtMarks(text) {
  let out = text;
  for (const mark of [MARK_BROKEN, MARK_WARN, MARK_PASS]) {
    const at = out.indexOf(mark);
    if (at !== -1) out = out.slice(0, at);
  }
  return out;
}

// Collapse whitespace (incl. newlines) and truncate to ~n chars for a title.
function truncate(text, n) {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length <= n ? flat : flat.slice(0, n).trim();
}

// The owner's note for a step block: text after the mark on its line, plus any
// following non-empty lines that are not the step's `Expect:` clause.
function extractNote(blockLines) {
  let markIdx = -1;
  for (let k = 0; k < blockLines.length; k++) {
    if (
      detectVerdict(blockLines[k]) === "broken" ||
      detectVerdict(blockLines[k]) === "friction"
    ) {
      markIdx = k;
      break;
    }
  }
  if (markIdx === -1) return "";
  const parts = [];
  const head = textAfterMark(blockLines[markIdx]);
  if (head) parts.push(head);
  for (let k = markIdx + 1; k < blockLines.length; k++) {
    const t = String(blockLines[k]).trim();
    if (!t) continue;
    if (/^Expect:/i.test(t)) continue;
    parts.push(t);
  }
  return parts.join(" ").trim();
}

function makeFinding({ session, sessionTitle, step, stepText, verdict, note }) {
  const meta = verdictMeta(verdict);
  return {
    session,
    sessionTitle: sessionTitle || "",
    step: step ?? null,
    stepText: String(stepText ?? "").trim(),
    verdict,
    severity: meta.severity,
    note: String(note ?? "").trim(),
  };
}

function processStepBlock({ session, stepNum, firstLineRest, blockLines }) {
  const verdict = detectVerdict(blockLines.join("\n"));
  if (verdict !== "broken" && verdict !== "friction") return null; // ✅ or unmarked
  let stepText = cutAtMarks(cutAt(firstLineRest, /Expect:/i)).trim();
  const note = extractNote(blockLines);
  return makeFinding({
    session: session ? session.token : "unknown",
    sessionTitle: session ? session.title : "",
    step: stepNum,
    stepText,
    verdict,
    note,
  });
}

// Parse the whole plan. Never throws: per-block failures increment `skipped`.
// Returns [...sortedFindings, { kind: "summary", findings, skipped }].
function parseTestPlan(markdown) {
  const findings = [];
  let skipped = 0;
  const lines = String(markdown ?? "").split(/\r?\n/);
  let session = null; // { token, title }
  let inRedFlags = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    try {
      const sh = /^##\s+SESSION\s+(\S+)\s*(.*)$/i.exec(line);
      if (sh) {
        session = { token: sh[1], title: sh[2].trim() };
        inRedFlags = false;
        i++;
        continue;
      }
      if (/^##\s+Anytime\s+red-?flags/i.test(line)) {
        inRedFlags = true;
        session = null;
        i++;
        continue;
      }
      if (/^##\s+/.test(line)) {
        inRedFlags = false;
        i++;
        continue;
      }

      if (inRedFlags) {
        const v = detectVerdict(line);
        if (v === "broken" || v === "friction") {
          const note = textAfterMark(line);
          findings.push(
            makeFinding({
              session: "anytime",
              sessionTitle: "Anytime red-flags",
              step: null,
              stepText: note,
              verdict: "broken", // red-flags are high-severity by contract
              note,
            }),
          );
        }
        i++;
        continue;
      }

      const sm = /^\s*(\d+)\.\s+(.*)$/.exec(line);
      if (sm) {
        const stepNum = sm[1];
        const blockLines = [line];
        let j = i + 1;
        while (
          j < lines.length &&
          !/^\s*\d+\.\s+/.test(lines[j]) &&
          !/^##\s+/.test(lines[j])
        ) {
          blockLines.push(lines[j]);
          j++;
        }
        const finding = processStepBlock({
          session,
          stepNum,
          firstLineRest: sm[2],
          blockLines,
        });
        if (finding) findings.push(finding);
        i = j;
        continue;
      }

      // An orphan ⚠️/❌ mark with no step/red-flag home is malformed: count it.
      const orphan = detectVerdict(line);
      if (
        (orphan === "broken" || orphan === "friction") &&
        line.trim() !== ""
      ) {
        skipped++;
      }
      i++;
    } catch {
      skipped++;
      i++;
    }
  }

  const sorted = sortFindings(findings);
  sorted.push({ kind: "summary", findings: findings.length, skipped });
  return sorted;
}

// ❌ (rank 0) sorts before ⚠️ (rank 1); stable within a rank.
function sortFindings(findings) {
  return findings
    .map((f, idx) => ({ f, idx }))
    .sort((a, b) => {
      const ra = verdictMeta(a.f.verdict).rank;
      const rb = verdictMeta(b.f.verdict).rank;
      return ra - rb || a.idx - b.idx;
    })
    .map((x) => x.f);
}

// --- gh command composition -------------------------------------------------

// POSIX single-quote a string for safe (printed) shell inclusion.
function shellQuote(str) {
  return `'${String(str ?? "").replace(/'/g, `'\\''`)}'`;
}

function findingTitle(finding) {
  const stepPart = finding.step != null ? `#${finding.step}` : "";
  return `[test-plan] S${finding.session}${stepPart}: ${truncate(finding.stepText, TITLE_TEXT_MAX)}`;
}

function markerLine(finding) {
  return finding.note && finding.note.includes("OWNER-GATE")
    ? `- [ ] OWNER-GATE: ${finding.note}`
    : `- [ ] AGENT-TODO: reproduce and fix`;
}

function findingBody(finding) {
  const sessionLine = finding.sessionTitle
    ? `session: ${finding.session} — ${finding.sessionTitle}`
    : `session: ${finding.session}`;
  return [
    sessionLine,
    `step: ${finding.step != null ? finding.step : "(red-flag)"}`,
    `verdict: ${finding.verdict} (${finding.severity})`,
    ``,
    `Step text:`,
    finding.stepText || "(none)",
    ``,
    `Owner note:`,
    finding.note || "(none)",
    ``,
    markerLine(finding),
  ].join("\n");
}

// A single (bash-quoted) `gh issue create` command. Printed, never executed.
function buildGhCommand(finding) {
  return [
    `gh issue create -R ${REPO}`,
    `--label ${LABEL}`,
    `--title ${shellQuote(findingTitle(finding))}`,
    `--body ${shellQuote(findingBody(finding))}`,
  ].join(" ");
}

// --- I/O --------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  const gh = args.includes("--gh");
  const pathArg = args.find((a) => !a.startsWith("--"));
  if (!pathArg) {
    console.error(
      "usage: node scripts/agent/farm-test-plan.mjs <path-to-plan.md> [--gh]",
    );
    process.exitCode = 1;
    return;
  }

  let markdown;
  try {
    markdown = readFileSync(pathArg, "utf8");
  } catch (err) {
    console.error(`farm-test-plan: could not read ${pathArg}: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const result = parseTestPlan(markdown);
  if (gh) {
    for (const f of result) {
      if (f && f.kind === "summary") continue;
      console.log(buildGhCommand(f));
      console.log("");
    }
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

const isDirectRun =
  process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  main(process.argv);
}

export {
  parseTestPlan,
  sortFindings,
  detectVerdict,
  textAfterMark,
  extractNote,
  truncate,
  shellQuote,
  findingTitle,
  findingBody,
  markerLine,
  buildGhCommand,
};
