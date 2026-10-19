import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { assertWalkFoundFiles, readDirCached } from "./helpers/repoWalk";

/**
 * Disabled-test guard (shrink-only).
 *
 * Idea credit: Kent Beck, "Augmented Coding: Beyond the Vibes"
 * (https://kentbeck.com/summaries/augmented-coding-beyond-the-vibes/) -- a
 * coding agent under pressure to "make the tests pass" will happily delete
 * or disable the failing test instead. This guard closes that shortcut: a
 * focused test (`.only`), an unconditionally disabled test (`.skip` /
 * `.fixme` with a literal or no condition, `xit`, `xtest`, `xdescribe`) or a
 * parked `.todo` fails the suite.
 *
 * Still allowed, because they are honest, conditional gates rather than
 * hidden test debt:
 *   - `test.skip(<expression>, "reason")`, e.g. the NEXT_PUBLIC_MOMENTS_HOME
 *     legacy-cockpit gates and the env-gated smoke skips;
 *   - `.skipIf(...)` / `.runIf(...)`;
 *   - non-call references such as
 *     `runLocalRlsTests ? describe : describe.skip`.
 *
 * Detection walks the TypeScript AST (same parser plainLanguageScan.ts
 * already uses), so comments and string literals -- including the synthetic
 * snippets in this file's own self-tests -- are never mistaken for calls.
 *
 * Scan roots are repo-root-relative and already covered by turbo.json's
 * `test.inputs` ($TURBO_DEFAULT$ for apps/web, `$TURBO_ROOT$/scripts/**`);
 * packages/* is deliberately not scanned.
 */

// #761 -- belt-and-braces timeout alongside the readDirCached walk helper
// used by the other repo-walking guards in this suite.
vi.setConfig({ testTimeout: 30_000 });

const repoRoot = resolve(__dirname, "../../../..");

// ---------------------------------------------------------------------------
// Shrink-only allowlist. Keyed by repo-root-relative path. A file with more
// findings than its count fails, a file missing from this list fails, and a
// file with FEWER findings than its count also fails (lower the count, or
// remove the entry, in the same PR that removes the disabled test).
// Never add an entry to get a red run green.
// ---------------------------------------------------------------------------
type AllowlistEntry = { count: number; reason: string };

const DISABLED_TEST_ALLOWLIST: Readonly<Record<string, AllowlistEntry>> = {
  "apps/web/tests/smoke/golden-journey.smoke.spec.ts": {
    count: 1,
    reason:
      "test.fixme(true, ...) on the owner-run external Google write lane: it needs a live production Google connection that agent and CI environments do not have.",
  },
};

// ---------------------------------------------------------------------------
// Pure detector
// ---------------------------------------------------------------------------

type DisabledTestFinding = {
  line: number;
  shape: string;
};

const TEST_API_ROOTS = new Set(["it", "test", "describe", "suite"]);
const X_DISABLED_CALLEES = new Set(["xit", "xtest", "xdescribe"]);
/** Modifiers that disable or focus a test outright when they appear inside a
 * callee chain such as `it.only.each(...)` or `describe.skip.each(...)`. */
const CHAIN_MODIFIERS = new Set(["only", "skip", "fixme", "todo"]);

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (/\.(?:m?js|cjs)$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function unwrapParens(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/** `test.describe.only` -> { root: "test", names: ["describe", "only"] }. */
function memberChain(
  expression: ts.Expression,
): { root: string; names: string[] } | null {
  const names: string[] = [];
  let current = unwrapParens(expression);
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = unwrapParens(current.expression);
  }
  return ts.isIdentifier(current) ? { root: current.text, names } : null;
}

/** First argument that makes `.skip(` / `.fixme(` unconditional: none at
 * all, a string or template literal (vitest's `it.skip("name", fn)`), or
 * the literal `true`. */
function isUnconditionalFirstArgument(
  argument: ts.Expression | undefined,
): boolean {
  if (!argument) return true;
  const value = unwrapParens(argument);
  return (
    ts.isStringLiteral(value) ||
    ts.isNoSubstitutionTemplateLiteral(value) ||
    ts.isTemplateExpression(value) ||
    value.kind === ts.SyntaxKind.TrueKeyword
  );
}

function classifyCall(call: ts.CallExpression): string | null {
  const callee = unwrapParens(call.expression);

  if (ts.isIdentifier(callee)) {
    return X_DISABLED_CALLEES.has(callee.text) ? `${callee.text}(` : null;
  }

  const chain = memberChain(callee);
  if (!chain || !TEST_API_ROOTS.has(chain.root) || chain.names.length === 0) {
    return null;
  }

  const method = chain.names[chain.names.length - 1];
  const dotted = `${chain.root}.${chain.names.join(".")}(`;

  if (method === "only" || method === "todo") return dotted;
  if (method === "skip" || method === "fixme") {
    return isUnconditionalFirstArgument(call.arguments[0]) ? dotted : null;
  }

  // `it.only.each(...)`, `describe.skip.each(...)`, `test.fixme.each(...)`.
  const modifiers = chain.names.slice(0, -1);
  return modifiers.some((name) => CHAIN_MODIFIERS.has(name)) ? dotted : null;
}

function findDisabledTests(
  source: string,
  fileName = "snippet.test.ts",
): DisabledTestFinding[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  const findings: DisabledTestFinding[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const shape = classifyCall(node);
      if (shape) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        findings.push({ line: line + 1, shape });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return findings;
}

// ---------------------------------------------------------------------------
// Pure allowlist comparison
// ---------------------------------------------------------------------------

const FIX_OR_DELETE_ADVICE =
  "Fix the test so it passes, or delete it openly and give the reason in the PR description. Never disable a test (.only, .skip, .fixme, .todo, xit, xtest, xdescribe) to get a green run.";

function compareWithAllowlist(
  findingsByFile: ReadonlyMap<string, readonly DisabledTestFinding[]>,
  allowlist: Readonly<Record<string, AllowlistEntry>>,
): { overCount: string[]; underCount: string[] } {
  const overCount: string[] = [];
  const underCount: string[] = [];

  for (const [file, findings] of [...findingsByFile].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const allowed = allowlist[file]?.count ?? 0;
    if (findings.length > allowed) {
      const where = findings
        .map((finding) => `  ${file}:${finding.line} uses ${finding.shape}`)
        .join("\n");
      overCount.push(
        `${file} has ${findings.length} focused or disabled test call(s), but only ${allowed} ${allowed === 1 ? "is" : "are"} allowed:\n${where}`,
      );
    }
  }

  for (const [file, entry] of Object.entries(allowlist).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const actual = findingsByFile.get(file)?.length ?? 0;
    if (actual < entry.count) {
      underCount.push(
        `${file} now has ${actual} disabled test call(s), but the allowlist still allows ${entry.count}. Good news: lower the count (or remove the entry) in DISABLED_TEST_ALLOWLIST so the old allowance cannot be reused.`,
      );
    }
  }

  return { overCount, underCount };
}

// ---------------------------------------------------------------------------
// Repo walk
// ---------------------------------------------------------------------------

const IGNORED_DIRECTORIES = new Set(["node_modules", ".next", "dist"]);

function walkFiles(
  relativePath: string,
  include: (relativeFile: string) => boolean,
): string[] {
  return readDirCached(resolve(repoRoot, relativePath)).flatMap((entry) => {
    const next = `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) {
        return [];
      }
      return walkFiles(next, include);
    }
    return entry.isFile() && include(next) ? [next] : [];
  });
}

function scanFiles(files: readonly string[]) {
  const findingsByFile = new Map<string, DisabledTestFinding[]>();
  for (const file of files) {
    const findings = findDisabledTests(
      readFileSync(resolve(repoRoot, file), "utf8"),
      file,
    );
    if (findings.length > 0) findingsByFile.set(file, findings);
  }
  return findingsByFile;
}

// ---------------------------------------------------------------------------
// Detector self-tests (synthetic snippets, no repo I/O)
// ---------------------------------------------------------------------------

describe("disabled-test detector self-tests", () => {
  const forbidden: Array<[string, string]> = [
    ["it.only", `it.only("does a thing", () => {});`],
    ["test.only", `test.only("does a thing", () => {});`],
    ["describe.only", `describe.only("group", () => {});`],
    ["suite.only", `suite.only("group", () => {});`],
    ["playwright test.describe.only", `test.describe.only("group", () => {});`],
    ["it.only.each", `it.only.each([1, 2])("case %s", () => {});`],
    ["xit", `xit("does a thing", () => {});`],
    ["xtest", `xtest("does a thing", () => {});`],
    ["xdescribe", `xdescribe("group", () => {});`],
    ["it.todo", `it.todo("write this later");`],
    ["test.todo", `test.todo("write this later");`],
    ["describe.todo", `describe.todo("group later");`],
    ["it.skip with a name", `it.skip("does a thing", () => {});`],
    ["test.skip with a template name", "test.skip(`does ${thing}`, () => {});"],
    [
      "test.skip with a plain template name",
      "test.skip(`does a thing`, () => {});",
    ],
    ["describe.skip with a name", `describe.skip("group", () => {});`],
    ["test.skip with no argument", `test("x", () => { test.skip(); });`],
    [
      "test.skip(true, reason)",
      `test("x", () => { test.skip(true, "flaky"); });`,
    ],
    [
      "test.fixme(true, reason)",
      `test("x", () => { test.fixme(true, "broken"); });`,
    ],
    ["test.fixme with a name", `test.fixme("does a thing", async () => {});`],
    ["test.fixme with no argument", `test("x", () => { test.fixme(); });`],
    ["test.describe.skip", `test.describe.skip("group", () => {});`],
    ["it.concurrent.skip", `it.concurrent.skip("does a thing", () => {});`],
    ["describe.skip.each", `describe.skip.each([1])("case %s", () => {});`],
  ];

  it.each(forbidden)("catches %s (RED case)", (_label, snippet) => {
    const findings = findDisabledTests(snippet);
    expect(findings, snippet).toHaveLength(1);
    expect(findings[0].line).toBe(1);
  });

  const allowed: Array<[string, string]> = [
    [
      "conditional test.skip on NEXT_PUBLIC_MOMENTS_HOME",
      `test.skip(process.env.NEXT_PUBLIC_MOMENTS_HOME !== "false", "#687: legacy route");`,
    ],
    [
      "env-gated smoke skip",
      `test("x", () => { test.skip(!canAuthenticate(env), "needs auth"); });`,
    ],
    [
      "runtime-gated skip",
      `test("x", () => { test.skip(!loggedIn, "login failed"); });`,
    ],
    [
      "callback-gated skip",
      `test.skip(({ browserName }) => browserName === "webkit", "not on webkit");`,
    ],
    [
      "conditional fixme",
      `test("x", () => { test.fixme(isMobile, "layout differs"); });`,
    ],
    ["it.skipIf", `it.skipIf(process.env.CI)("does a thing", () => {});`],
    ["describe.runIf", `describe.runIf(hasDb)("group", () => {});`],
    [
      "non-call describe.skip reference",
      `const describeLocalRls = runLocalRlsTests ? describe : describe.skip;\ndescribeLocalRls("rls", () => {});`,
    ],
    ["a plain test", `it("does a thing", () => { expect(1).toBe(1); });`],
    [
      "it.each",
      `it.each([1, 2])("case %s", (n) => { expect(n).toBeTruthy(); });`,
    ],
    [
      "forbidden shapes inside comments",
      `// it.only("x", () => {});\n/* xdescribe("y", () => {}); test.skip(); */\nit("ok", () => {});`,
    ],
    [
      "forbidden shapes inside strings",
      `const snippet = 'it.only("x", () => {}); test.skip(true, "y"); it.todo("z")';`,
    ],
    [
      "unrelated .skip/.only/.todo receivers",
      `stream.skip(2); query.only("id"); list.todo("item"); ctx.skip();`,
    ],
    [
      "identifiers that merely end in it/test",
      `maxit("a"); fixit("b"); contest("c");`,
    ],
  ];

  it.each(allowed)("allows %s", (_label, snippet) => {
    expect(findDisabledTests(snippet)).toEqual([]);
  });

  it("reports the correct line in a multi-line file and parses .mjs and .tsx", () => {
    const source = [
      `import { it } from "vitest";`,
      ``,
      `it("ok", () => {});`,
      `it.only("focused", () => {});`,
    ].join("\n");
    expect(findDisabledTests(source, "a.test.mjs")).toEqual([
      { line: 4, shape: "it.only(" },
    ]);
    expect(
      findDisabledTests(
        `xit("renders", () => { render(<div />); });`,
        "a.test.tsx",
      ),
    ).toEqual([{ line: 1, shape: "xit(" }]);
  });

  it("fails a file over its count or missing from the allowlist", () => {
    const allowlist = { "a.spec.ts": { count: 1, reason: "r" } };
    const findingsByFile = new Map([
      [
        "a.spec.ts",
        [
          { line: 3, shape: "test.fixme(" },
          { line: 9, shape: "test.skip(" },
        ],
      ],
      ["b.test.ts", [{ line: 5, shape: "it.only(" }]],
    ]);
    const result = compareWithAllowlist(findingsByFile, allowlist);
    expect(result.underCount).toEqual([]);
    expect(result.overCount).toHaveLength(2);
    expect(result.overCount[0]).toContain("a.spec.ts:9 uses test.skip(");
    expect(result.overCount[1]).toContain("b.test.ts:5 uses it.only(");
  });

  it("fails a file under its count, including one with no findings left", () => {
    const allowlist = {
      "a.spec.ts": { count: 2, reason: "r" },
      "gone.spec.ts": { count: 1, reason: "r" },
    };
    const findingsByFile = new Map([
      ["a.spec.ts", [{ line: 3, shape: "test.fixme(" }]],
    ]);
    const result = compareWithAllowlist(findingsByFile, allowlist);
    expect(result.overCount).toEqual([]);
    expect(result.underCount).toHaveLength(2);
    expect(result.underCount[0]).toContain("a.spec.ts now has 1");
    expect(result.underCount[1]).toContain("gone.spec.ts now has 0");
  });

  it("passes when every file matches its allowlist count exactly", () => {
    const allowlist = { "a.spec.ts": { count: 1, reason: "r" } };
    const findingsByFile = new Map([
      ["a.spec.ts", [{ line: 3, shape: "test.fixme(" }]],
    ]);
    expect(compareWithAllowlist(findingsByFile, allowlist)).toEqual({
      overCount: [],
      underCount: [],
    });
  });

  it("starts with exactly one allowlist entry, each with a reason", () => {
    expect(Object.keys(DISABLED_TEST_ALLOWLIST)).toEqual([
      "apps/web/tests/smoke/golden-journey.smoke.spec.ts",
    ]);
    for (const entry of Object.values(DISABLED_TEST_ALLOWLIST)) {
      expect(entry.count).toBeGreaterThan(0);
      expect(entry.reason.trim().length).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// Real repo scan
// ---------------------------------------------------------------------------

describe("no focused, disabled, or parked tests in the repo", () => {
  // Current counts at time of writing: ~310 / ~62 / ~6. Floors sit well
  // under those so they only trip on a genuine walk collapse.
  const srcTestFiles = walkFiles("apps/web/src", (file) =>
    /\.test\.(?:ts|tsx)$/.test(file),
  );
  const browserTestFiles = walkFiles("apps/web/tests", (file) =>
    /\.(?:ts|tsx|js|mjs)$/.test(file),
  );
  const scriptTestFiles = walkFiles("scripts", (file) =>
    /\.test\.mjs$/.test(file),
  );

  it("finds the files it is meant to scan", () => {
    assertWalkFoundFiles(
      srcTestFiles,
      "disabledTestGuard apps/web/src/**/*.test.{ts,tsx}",
      100,
    );
    assertWalkFoundFiles(
      browserTestFiles,
      "disabledTestGuard apps/web/tests/**",
      20,
    );
    assertWalkFoundFiles(
      scriptTestFiles,
      "disabledTestGuard scripts/**/*.test.mjs",
      2,
    );
  });

  it("keeps every disabled test within the shrink-only allowlist", () => {
    const findingsByFile = scanFiles([
      ...srcTestFiles,
      ...browserTestFiles,
      ...scriptTestFiles,
    ]);
    const { overCount, underCount } = compareWithAllowlist(
      findingsByFile,
      DISABLED_TEST_ALLOWLIST,
    );

    expect(
      overCount,
      `A test is focused (.only), disabled (.skip / .fixme with no real condition, xit, xtest, xdescribe), or parked (.todo):\n\n${overCount.join("\n\n")}\n\n${FIX_OR_DELETE_ADVICE}`,
    ).toEqual([]);
    expect(
      underCount,
      `The disabled-test allowlist is larger than it needs to be:\n\n${underCount.join("\n\n")}`,
    ).toEqual([]);
  });
});
