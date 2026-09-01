export const SAFE_AUTOMERGE_REQUIRED_LABELS = ["automerge:safe", "risk:low"];

// ADR 0008 move 1b (owner-ratified 2026-08-04): strictly-additive test-only
// PRs may ride the safe auto-merge lane under their own label. "Strictly
// additive" is machine-checked in check-safe-automerge.mjs: every changed
// file matches these patterns AND the diff contains zero deleted lines
// (renames, deletions, and binary changes disqualify). A new test cannot
// weaken an existing assertion; CI still gates the merge.
export const ADDITIVE_TESTS_LABEL = "automerge:tests-additive";
export const ADDITIVE_TESTS_REQUIRED_LABELS = [
  ADDITIVE_TESTS_LABEL,
  "risk:low",
];
export const ADDITIVE_TESTS_ALLOWED_PATH_PATTERNS = [
  "apps/web/src/__tests__/**",
  "apps/web/tests/e2e/**",
  "apps/**/*.test.ts",
  "apps/**/*.test.tsx",
  "packages/**/*.test.ts",
  "packages/**/*.test.tsx",
];
export const SAFE_AUTOMERGE_BLOCKING_LABELS = [
  "risk:medium",
  "risk:high",
  "needs:human-decision",
];

// ADR 0008 move 2 (owner-ratified 2026-08-04, window owner-set to 30
// minutes): a risk:low, non-T2+ agent PR may arm auto-merge after sitting
// open for the window with the owner notified. Flip `enabled` to false to
// demote the whole class (the ADR's reversal trigger); the scan also
// pauses itself automatically whenever main is red or a Main Red Guard
// revert PR is open.
export const SELFMERGE_WINDOW = {
  enabled: true,
  // Owner amendment 2026-08-05: instant mode, no fallback (chosen knowingly
  // over a delivery-confirmed fallback). The Telegram notice is best-effort;
  // a failed send still merges. windowMinutes 0 = arm immediately; required
  // CI checks remain the only wait. `selfmerge:30m` stays as an alias.
  labels: ["selfmerge:auto", "selfmerge:30m"],
  windowMinutes: 0,
  ownerLogin: "jpatel900",
};

export const SAFE_AUTOMERGE_ALLOWED_PATH_PATTERNS = [
  "docs/**",
  "README.md",
  ".github/ISSUE_TEMPLATE/**",
  // Extended 2026-07-03 after the epic #243 pipeline proved the lane
  // (owner approval; see AGENT_AUTOMATION_POLICY.md T0). Skills are
  // agent-facing markdown synced from the owner's curated hub; CI and
  // the docRegistry guard still gate.
  ".agents/skills/**",
];

export const LOW_RISK_FORBIDDEN_PATH_PATTERNS = [
  "supabase/**",
  "**/migrations/**",
  "apps/web/src/lib/googleCalendar/**",
  "apps/web/src/app/api/google-calendar/**",
  "apps/web/src/lib/ai/**",
  "apps/web/src/lib/observability/**",
  "apps/web/src/lib/supabase/**",
  "apps/web/src/lib/externalWrites/**",
  "apps/web/src/app/login/**",
  ".github/workflows/**",
  ".github/actions/**",
  ".github/codex/prompts/**",
  "scripts/agent/**",
  ".env*",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "vercel.json",
  ".vercel/**",
];

export const CI_AUTOFIX_FORBIDDEN_PATH_PATTERNS = [
  "supabase/**",
  "**/migrations/**",
  "apps/web/src/lib/googleCalendar/**",
  "apps/web/src/app/api/google-calendar/**",
  "apps/web/src/lib/ai/**",
  "apps/web/src/lib/observability/**",
  "apps/web/src/lib/supabase/**",
  "apps/web/src/lib/externalWrites/**",
  "apps/web/src/app/login/**",
  ".github/workflows/**",
  ".github/actions/**",
  ".github/codex/prompts/**",
  "scripts/agent/**",
  ".env*",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "vercel.json",
  ".vercel/**",
];

export const HIGH_RISK_LABELS = new Set([
  "risk:high",
  "needs:human-decision",
  "area:security",
  "area:supabase",
  "area:calendar",
  "area:parser",
  "area:observability",
  "area:deployment",
]);

export const HIGH_RISK_PATH_PATTERNS = [
  "supabase/**",
  "apps/web/src/lib/supabase/**",
  "apps/web/src/lib/googleCalendar/**",
  "apps/web/src/app/api/google-calendar/**",
  "apps/web/src/lib/ai/**",
  "apps/web/src/lib/observability/**",
  "apps/web/src/lib/externalWrites/**",
  "apps/web/src/app/login/**",
  "apps/web/instrumentation*",
  "apps/web/sentry*",
  "apps/web/langfuse*",
  ".github/workflows/**",
  ".github/codex/prompts/**",
  "scripts/agent/**",
  ".env*",
  ".env.example",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
];

// Owner decision 2026-08-30: no PR may ever be armed for auto-merge (by
// EITHER the safe-automerge sync, the self-merge window, or Main Red
// Guard's confirm-arm) while it is still owner-gated or a ratification PR
// — regardless of which labels or path allowlists it otherwise satisfies.
// The 2026-08-30 incident (#935) was a ratification PR ("OWNER
// RATIFICATION REQUIRED" in the body) that the safe-automerge sync armed
// anyway. This check is a hard block layered on top of every other
// eligibility route, not a replacement for any of them.
//
// Draft is a separate, pre-existing rule, not part of this function: each
// caller already refuses a draft PR on its own (classifyEligibility /
// classifyAdditiveTestsEligibility in check-safe-automerge.mjs, the
// `draft` check in selfmerge-window.mjs's evaluateSelfmergeCandidate).
// It has equal priority to everything checked here — nothing bypasses it
// — it just isn't duplicated into this function too.
//
// The `owner-gate` label exists in this repo (created 2026-08-30,
// "gh label create owner-gate") specifically so this check has something
// live to match; apply it to hold any PR back regardless of its body text.
export const OWNER_GATE_LABEL = "owner-gate";

// An unchecked OWNER-GATE task-list line (AGENTS.md rule 11's follow-up
// marker convention). Checked boxes (`- [x] OWNER-GATE:`) do not block —
// resolving the item is exactly what checking the box records. GFM accepts
// any of `-`/`*`/`+` as the bullet (AGENTS.md never mandates `-`), an
// optional blockquote `>` prefix (GitHub still renders `> - [ ] ...` as a
// task list inside a quoted block), and the box itself may hold zero, one,
// or more spaces (`[]`, `[ ]`, `[  ]` all render as unchecked — only a
// non-whitespace mark like `x` checks it).
const OWNER_GATE_CHECKBOX_RE = /^\s*(?:>\s*)*[-*+]\s*\[\s*\]\s*OWNER-GATE\b/im;
// "OWNER RATIFICATION REQUIRED" anywhere in the body (the ratification-PR
// marker #935 used).
const OWNER_RATIFICATION_RE = /OWNER RATIFICATION REQUIRED/i;
// "OWNER-GATE" inside a markdown heading (# .. OWNER-GATE .. or with a
// leading emoji/other heading marker before it).
const OWNER_GATE_HEADING_RE = /^\s{0,3}#{1,6}[^\n]*OWNER-GATE/im;

// Fail closed: `body` must be a string (even "") to say "the body was
// successfully read and contains no marker". Pass `null`/`undefined` only
// when the body genuinely could not be fetched — that always blocks.
export function evaluateOwnerGateBlock({ title, body, labels }) {
  const reasons = [];
  const safeLabels = Array.isArray(labels) ? labels : [];
  const safeTitle = typeof title === "string" ? title : "";

  if (typeof body !== "string") {
    reasons.push(
      "PR body could not be read — failing closed (never arm without it).",
    );
    return { blocked: true, reasons };
  }

  if (
    OWNER_GATE_CHECKBOX_RE.test(body) ||
    OWNER_GATE_CHECKBOX_RE.test(safeTitle)
  ) {
    reasons.push("Unchecked OWNER-GATE task-list line present.");
  }
  if (
    OWNER_RATIFICATION_RE.test(body) ||
    OWNER_RATIFICATION_RE.test(safeTitle)
  ) {
    reasons.push('PR contains "OWNER RATIFICATION REQUIRED".');
  }
  if (OWNER_GATE_HEADING_RE.test(body)) {
    reasons.push('PR body contains an "OWNER-GATE" heading.');
  }
  if (safeLabels.includes(OWNER_GATE_LABEL)) {
    reasons.push(`Owner-gate label present: \`${OWNER_GATE_LABEL}\`.`);
  }

  return { blocked: reasons.length > 0, reasons };
}

export function normalizePath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

export function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let regex = "^";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (char === "*") {
      if (normalized[index + 1] === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      regex += `\\${char}`;
      continue;
    }

    regex += char;
  }

  regex += "$";
  return new RegExp(regex);
}

function compilePatterns(patterns) {
  return patterns.map((pattern) => ({
    pattern,
    regex: globToRegExp(pattern),
  }));
}

const POLICY_DEFS = {
  "safe-automerge": {
    allowed: compilePatterns(SAFE_AUTOMERGE_ALLOWED_PATH_PATTERNS),
    forbidden: compilePatterns(HIGH_RISK_PATH_PATTERNS),
  },
  "additive-tests": {
    allowed: compilePatterns(ADDITIVE_TESTS_ALLOWED_PATH_PATTERNS),
    forbidden: compilePatterns(HIGH_RISK_PATH_PATTERNS),
  },
  "low-risk": {
    forbidden: compilePatterns(LOW_RISK_FORBIDDEN_PATH_PATTERNS),
  },
  "ci-autofix": {
    forbidden: compilePatterns(CI_AUTOFIX_FORBIDDEN_PATH_PATTERNS),
  },
};

export function matchPatterns(changedPath, compiledPatterns) {
  return compiledPatterns.filter(({ regex }) => regex.test(changedPath));
}

export function evaluateAutomationPolicy(mode, changedPaths) {
  const normalizedPaths = changedPaths
    .map((path) => normalizePath(path))
    .filter(Boolean);
  const policy = POLICY_DEFS[mode];

  if (!policy) {
    throw new Error(`Unknown automation policy mode: ${mode}`);
  }

  const violations = [];

  for (const changedPath of normalizedPaths) {
    const forbiddenMatches = matchPatterns(changedPath, policy.forbidden ?? []);
    if (forbiddenMatches.length > 0) {
      for (const match of forbiddenMatches) {
        violations.push({
          path: changedPath,
          reason: "forbidden",
          pattern: match.pattern,
        });
      }
      continue;
    }

    if (policy.allowed) {
      const allowedMatches = matchPatterns(changedPath, policy.allowed);
      if (allowedMatches.length === 0) {
        violations.push({
          path: changedPath,
          reason: "outside-allowlist",
          pattern: "allowed-paths",
        });
      }
    }
  }

  return {
    eligible: violations.length === 0,
    mode,
    violations,
  };
}
