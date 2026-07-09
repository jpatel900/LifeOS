import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

/**
 * Public-evidence hygiene guard.
 *
 * This repo is public. Docs must never carry production identifiers or
 * personal data that a reader could use to fingerprint the live deployment
 * or its owner (AGENTS.md rule 13). This test scans documentation markdown
 * (docs/** and top-level repo markdown like README.md/AGENTS.md) for:
 *   - UUID-shaped strings (often row/user/task IDs pulled from prod)
 *   - the known production Supabase project ref
 *   - email addresses
 *
 * It deliberately does NOT scan `supabase/migrations/**`, test fixtures, or
 * non-doc source code — those are out of scope for "public evidence" and
 * migrations legitimately contain schema, not secrets.
 */

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const KNOWN_PROD_PROJECT_REF = "vpjmltajbaqxwunjjgtq";

/**
 * Shrink-only allowlist for deliberate, clearly-fake documented examples.
 *
 * Entries may only be REMOVED (when the example is deleted from docs),
 * never casually added. To add a new safe fake ID/email to a doc instead of
 * adding it here, prefer values that are self-evidently fake:
 *   - all-zeros UUID: 00000000-0000-0000-0000-000000000000
 *   - RFC 2606 reserved example domains: user@example.com, user@example.test
 * If a doc genuinely needs a new documented example that trips this guard,
 * add the exact literal string below with a comment naming the doc and why
 * it's fake, and get reviewer sign-off — do not loosen the regexes instead.
 */
const ALLOWLISTED_LITERALS = new Set([
  // README.md "Local development / smoke test users" section — seeded by
  // supabase/seed.sql for local Phase 4A smoke tests only, never a real
  // mailbox (uses the RFC 2606 reserved `.test` TLD).
  "user_a@example.test",
]);

const IGNORED_SCAN_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
  "worktrees",
]);

function walkMarkdownFiles(
  absoluteDir: string,
  relativePath: string,
): string[] {
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const nextRelativePath =
      relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;

    if (entry.isDirectory()) {
      if (IGNORED_SCAN_DIRECTORIES.has(entry.name)) {
        return [];
      }

      return walkMarkdownFiles(
        resolve(absoluteDir, entry.name),
        nextRelativePath,
      );
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      return [];
    }

    return [nextRelativePath];
  });
}

/**
 * In-scope doc files: everything under docs/ (recursively) plus top-level
 * markdown sitting directly in the repo root (README.md, AGENTS.md, etc.).
 * This intentionally excludes .agents/skills, .cursor, .github, and source
 * directories — those are not "public evidence" surfaces in scope here.
 */
function listInScopeDocFiles(): string[] {
  const docsFiles = walkMarkdownFiles(resolve(repoRoot, "docs"), "docs");

  const rootFiles = readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name);

  return [...rootFiles, ...docsFiles].sort();
}

interface Finding {
  path: string;
  kind: "uuid" | "prod-project-ref" | "email";
  match: string;
}

function scanContentForFindings(path: string, content: string): Finding[] {
  const findings: Finding[] = [];

  for (const match of content.matchAll(UUID_PATTERN)) {
    if (!ALLOWLISTED_LITERALS.has(match[0].toLowerCase())) {
      findings.push({ path, kind: "uuid", match: match[0] });
    }
  }

  if (
    content.includes(KNOWN_PROD_PROJECT_REF) &&
    !ALLOWLISTED_LITERALS.has(KNOWN_PROD_PROJECT_REF)
  ) {
    findings.push({
      path,
      kind: "prod-project-ref",
      match: KNOWN_PROD_PROJECT_REF,
    });
  }

  for (const match of content.matchAll(EMAIL_PATTERN)) {
    if (!ALLOWLISTED_LITERALS.has(match[0].toLowerCase())) {
      findings.push({ path, kind: "email", match: match[0] });
    }
  }

  return findings;
}

function scanFile(path: string): Finding[] {
  const content = readFileSync(resolve(repoRoot, path), "utf8");
  return scanContentForFindings(path, content);
}

describe("public evidence hygiene", () => {
  it("sanity check: scans a non-trivial number of doc files (positive control)", () => {
    const files = listInScopeDocFiles();

    // Guards against a broken walker silently scanning zero files and
    // making the "no findings" assertion below pass vacuously.
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(statSync(resolve(repoRoot, "docs")).isDirectory()).toBe(true);
  });

  it("detects a forged violation in an in-memory fixture (negative control)", () => {
    const forgedUuid = "1234abcd-1234-abcd-1234-1234567890ab";
    const forgedEmail = "not-a-real-person@example-corp-internal.com";
    const forgedContent = `some doc text mentioning ${forgedUuid} and ${forgedEmail} and ${KNOWN_PROD_PROJECT_REF}`;

    const findings = scanContentForFindings("__fixture__.md", forgedContent);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "uuid", match: forgedUuid }),
        expect.objectContaining({ kind: "email", match: forgedEmail }),
        expect.objectContaining({
          kind: "prod-project-ref",
          match: KNOWN_PROD_PROJECT_REF,
        }),
      ]),
    );
    expect(findings.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps docs free of UUIDs, the prod project ref, and email addresses", () => {
    const files = listInScopeDocFiles();
    const findings = files.flatMap((path) => scanFile(path));

    expect(
      findings,
      [
        "Public docs must not contain production identifiers or personal data",
        "(AGENTS.md rule 13). Replace the offending value with a placeholder",
        "(e.g. <prod-project-ref>, <owner-email>) or, if it's a genuinely fake",
        "documented example, add the exact literal to ALLOWLISTED_LITERALS in",
        "apps/web/src/__tests__/publicEvidenceHygiene.test.ts with a comment.",
        `Findings: ${JSON.stringify(findings, null, 2)}`,
      ].join("\n"),
    ).toEqual([]);
  });
});
