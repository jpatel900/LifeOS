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
  label: "selfmerge:30m",
  windowMinutes: 30,
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
