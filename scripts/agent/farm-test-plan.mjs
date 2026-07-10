#!/usr/bin/env node
// Purpose: turn an owner-marked scripted test plan into structured findings and
// ready-to-copy GitHub issue creation commands. This script never executes gh.

import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = "jpatel900/LifeOS";
const MARK_RE = /✅|⚠️?|❌/u;
const FINDING_MARK_RE = /⚠️?|❌/u;
const STEP_RE = /^\s*(\d+)\.\s*(.*)$/u;
const SESSION_RE = /^\s*##\s+SESSION\s+([^\s]+)\b\s*(.*)$/iu;
const ANYTIME_RE = /^\s*##\s+Anytime red-flags\b/i;
const HEADING_RE = /^\s*##\s+/u;

function stripCheckboxes(text) {
  return text.replace(/\[[ xX✅⚠️❌]*\]/gu, " ");
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/gu, " ").trim();
}

function cleanStepText(text) {
  const beforeExpect = text.split(/\bExpect\s*:/iu)[0];
  const beforeMark = beforeExpect.split(MARK_RE)[0];
  return normalizeWhitespace(stripCheckboxes(beforeMark));
}

function cleanNote(text, mark) {
  let cleaned = stripCheckboxes(text).replace(mark, " ");
  cleaned = cleaned.replace(/^\s*[-–—:]\s*/u, "");
  return cleaned.trim();
}

function sessionName(number, title) {
  const suffix = normalizeWhitespace(title ?? "");
  return suffix ? `SESSION ${number} ${suffix}` : `SESSION ${number}`;
}

function severityFor(verdict) {
  return verdict === "❌" ? "high" : "medium";
}

function titleSnippet(text) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= 60) return normalized;
  return `${normalized.slice(0, 57).trimEnd()}...`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function isNoteLine(line) {
  const trimmed = line.trim();
  return trimmed !== "" && !STEP_RE.test(trimmed) && !HEADING_RE.test(trimmed);
}

function collectFollowingNote(lines, startIndex) {
  const notes = [];
  let skipped = 0;
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (STEP_RE.test(line) || HEADING_RE.test(line)) break;
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    if (isNoteLine(line)) notes.push(line.trim());
    else skipped += 1;
    index += 1;
  }
  return { note: notes.join("\n").trim(), skipped };
}

function findVerdictAndNote(lines, startIndex, firstLine) {
  const firstMark = firstLine.match(MARK_RE)?.[0];
  if (firstMark) {
    const after = firstLine.slice(
      firstLine.indexOf(firstMark) + firstMark.length,
    );
    const sameLineNote = cleanNote(after, firstMark);
    if (sameLineNote)
      return { verdict: firstMark, note: sameLineNote, skipped: 0 };
    const following = collectFollowingNote(lines, startIndex);
    return {
      verdict: firstMark,
      note: following.note,
      skipped: following.skipped,
    };
  }

  let skipped = 0;
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (STEP_RE.test(line) || HEADING_RE.test(line)) break;
    const mark = line.match(MARK_RE)?.[0];
    if (mark) {
      const after = line.slice(line.indexOf(mark) + mark.length);
      const sameLineNote = cleanNote(after, mark);
      if (sameLineNote) return { verdict: mark, note: sameLineNote, skipped };
      const following = collectFollowingNote(lines, index);
      return {
        verdict: mark,
        note: following.note,
        skipped: skipped + following.skipped,
      };
    }
    if (line.trim() !== "" && !isNoteLine(line)) skipped += 1;
    index += 1;
  }
  return { verdict: null, note: "", skipped };
}

function sortFindings(findings) {
  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    if (a.session === b.session) return a.step - b.step;
    if (a.session === "anytime") return 1;
    if (b.session === "anytime") return -1;
    return a.session.localeCompare(b.session);
  });
}

export function parseFarmTestPlan(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/u);
  const findings = [];
  let skipped = 0;
  let currentSession = null;
  let inAnytime = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const sessionMatch = line.match(SESSION_RE);
    if (sessionMatch) {
      currentSession = sessionName(sessionMatch[1], sessionMatch[2]);
      inAnytime = false;
      continue;
    }
    if (ANYTIME_RE.test(line)) {
      inAnytime = true;
      currentSession = "anytime";
      continue;
    }
    if (HEADING_RE.test(line)) {
      inAnytime = false;
      continue;
    }

    if (inAnytime) {
      if (line.includes("❌")) {
        const note = cleanNote(line, "❌");
        findings.push({
          session: "anytime",
          step:
            findings.filter((finding) => finding.session === "anytime").length +
            1,
          stepText: note || "Anytime red-flag",
          verdict: "❌",
          severity: "high",
          note,
        });
      } else if (line.trim() && FINDING_MARK_RE.test(line)) {
        skipped += 1;
      }
      continue;
    }

    const stepMatch = line.match(STEP_RE);
    if (!stepMatch) {
      if (line.trim() && FINDING_MARK_RE.test(line)) skipped += 1;
      continue;
    }

    const step = Number(stepMatch[1]);
    const stepText = cleanStepText(stepMatch[2]);
    const parsed = findVerdictAndNote(lines, index, line);
    skipped += parsed.skipped;

    if (!currentSession || !Number.isFinite(step) || !stepText) {
      skipped += 1;
      continue;
    }
    if (parsed.verdict === "✅" || !parsed.verdict) continue;
    if (!FINDING_MARK_RE.test(parsed.verdict)) continue;

    findings.push({
      session: currentSession,
      step,
      stepText,
      verdict: parsed.verdict.startsWith("⚠") ? "⚠️" : parsed.verdict,
      severity: severityFor(parsed.verdict),
      note: parsed.note,
    });
  }

  return [
    ...sortFindings(findings),
    { summary: { findings: findings.length, skipped } },
  ];
}

export function composeIssueBody(finding) {
  const marker = finding.note.includes("OWNER-GATE")
    ? `- [ ] OWNER-GATE: ${finding.note}`
    : "- [ ] AGENT-TODO: reproduce and fix";
  return [
    `Session: ${finding.session}`,
    `Step: ${finding.step}`,
    `Step text: ${finding.stepText}`,
    `Verdict: ${finding.verdict}`,
    "",
    "Owner note:",
    finding.note || "(none)",
    "",
    marker,
  ].join("\n");
}

export function composeGhIssueCommand(finding) {
  const title = `[test-plan] S${finding.session === "anytime" ? "anytime" : (finding.session.match(/SESSION\s+([^\s]+)/i)?.[1] ?? finding.session)}#${finding.step}: ${titleSnippet(finding.stepText)}`;
  return [
    "gh issue create",
    "-R",
    shellQuote(REPO),
    "--title",
    shellQuote(title),
    "--label",
    shellQuote("usability"),
    "--body",
    shellQuote(composeIssueBody(finding)),
  ].join(" ");
}

export function composeOutput(parsed, { gh = false } = {}) {
  const json = JSON.stringify(parsed, null, 2);
  if (!gh) return `${json}\n`;
  const commands = parsed
    .filter((item) => !item.summary)
    .map((finding) => composeGhIssueCommand(finding));
  return `${json}\n${commands.join("\n")}${commands.length ? "\n" : ""}`;
}

export function runCli(argv = process.argv) {
  const args = argv.slice(2);
  const gh = args.includes("--gh");
  const path = args.find((arg) => arg !== "--gh");
  if (!path) {
    console.error(
      "Usage: node scripts/agent/farm-test-plan.mjs [--gh] <path-to-plan.md>",
    );
    return 1;
  }
  const parsed = parseFarmTestPlan(readFileSync(path, "utf8"));
  process.stdout.write(composeOutput(parsed, { gh }));
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runCli(process.argv);
}
