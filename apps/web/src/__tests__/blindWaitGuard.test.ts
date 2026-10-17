import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertWalkFoundFiles, readDirCached } from "./helpers/repoWalk";

/**
 * Blind-wait guard for browser tests (#289 quarterly distillation, PR #1084).
 *
 * Standing rule: a browser test waits for a visible ready state (a locator,
 * a response, a URL) and never sleeps for a fixed time; a test that depends
 * on the time of day pins the clock. Fixed sleeps were behind the flaky runs
 * in #1029, #1051, #1042, #1049 and #1052.
 *
 * This guard scans every script under `apps/web/tests/**` for the two shapes
 * a blind wait takes there: Playwright's `waitForTimeout(...)` and a bare
 * `setTimeout(...)` (a hand-rolled sleep or race timer). Playwright's own
 * `test.setTimeout(...)` sets a test budget, not a sleep, so a `setTimeout`
 * reached through a property (`x.setTimeout`) is not counted.
 *
 * The waits that already existed when the guard was born are listed in
 * BLIND_WAIT_ALLOWLIST with a count per file. The list may only shrink: a
 * file with more waits than its count, or a file not on the list, fails; a
 * file with fewer fails too, so the count gets lowered and the room is not
 * reused. Do not raise a count to make a new wait pass -- replace the wait.
 */

const repoRoot = resolve(__dirname, "../../../..");
const testsRoot = resolve(repoRoot, "apps/web/tests");

const SCANNED_EXTENSIONS = /\.(?:[cm]?[jt]s|tsx|jsx)$/;
const BLIND_WAIT_PATTERNS: readonly RegExp[] = [
  /\bwaitForTimeout\s*\(/g,
  /(?<![.\w$])setTimeout\s*\(/g,
];

const RULE_MESSAGE =
  "Browser tests must not sleep for a fixed time. Wait for something the user can see instead " +
  "(for example `await expect(locator).toBeVisible()`, `page.waitForResponse(...)` or " +
  "`page.waitForURL(...)`). If the test depends on the time of day, pin the clock with " +
  "`page.clock`. Rule: #289 quarterly distillation (PR #1084).";

type AllowlistEntry = { count: number; reason: string };

/**
 * Shrink-only. Keys are paths relative to `apps/web/tests`. 23 waits in 8
 * files when the guard was born (2026-10-17).
 */
const BLIND_WAIT_ALLOWLIST: Readonly<Record<string, AllowlistEntry>> = {
  "e2e/capture-sort-evidence.spec.ts": {
    count: 3,
    reason:
      "Evidence screenshots pause for animations to settle; not an assertion.",
  },
  "e2e/close-day-verdict.spec.ts": {
    count: 1,
    reason: "Pre-rule settle wait before the verdict check.",
  },
  "e2e/health-port-truth.spec.ts": {
    count: 1,
    reason: "Pre-rule wait proving no late request fires.",
  },
  "e2e/nav-truth.spec.ts": {
    count: 4,
    reason: "Pre-rule settle waits around navigation checks.",
  },
  "e2e/signed-in-account-truth.spec.ts": {
    count: 2,
    reason: "Pre-rule waits proving nothing changes after sync.",
  },
  "e2e/helpers/signedInAccount.ts": {
    count: 3,
    reason:
      "Measured clock-skew settle and retry back-off for PGRST303 (#841, #883).",
  },
  "smoke/helpers/smoke.ts": {
    count: 1,
    reason:
      "Race timer giving a sent request's answer a moment to beat the failure card.",
  },
  "evidence/capture-evidence.mjs": {
    count: 6,
    reason:
      "Manual evidence-capture script, not a test; pauses before screenshots.",
  },
};

function walkScripts(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readDirCached(dir)) {
    if (entry.name === "node_modules") continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkScripts(full));
    else if (SCANNED_EXTENSIONS.test(entry.name)) files.push(full);
  }
  return files;
}

function countBlindWaits(source: string): number {
  return BLIND_WAIT_PATTERNS.reduce(
    (total, pattern) => total + (source.match(pattern)?.length ?? 0),
    0,
  );
}

function scanBlindWaits(): Map<string, number> {
  const files = walkScripts(testsRoot);
  // About 60 scripts today; 20 only trips on a broken walk.
  assertWalkFoundFiles(files, "apps/web/tests scripts", 20);
  const counts = new Map<string, number>();
  for (const file of files) {
    const count = countBlindWaits(readFileSync(file, "utf8"));
    if (count > 0) counts.set(relative(testsRoot, file), count);
  }
  return counts;
}

describe("blind-wait guard for browser tests", () => {
  it("adds no new fixed-time waits under apps/web/tests", () => {
    const found = scanBlindWaits();
    const problems: string[] = [];

    for (const [file, count] of found) {
      const allowed = BLIND_WAIT_ALLOWLIST[file]?.count ?? 0;
      if (count > allowed) {
        problems.push(
          `apps/web/tests/${file}: ${count} fixed-time wait(s), only ${allowed} allowed.`,
        );
      }
    }

    expect(problems, `${problems.join("\n")}\n\n${RULE_MESSAGE}`).toEqual([]);
  });

  it("keeps the allowlist shrink-only (counts match what is left)", () => {
    const found = scanBlindWaits();
    const stale: string[] = [];

    for (const [file, entry] of Object.entries(BLIND_WAIT_ALLOWLIST)) {
      const count = found.get(file) ?? 0;
      if (count < entry.count) {
        stale.push(
          `apps/web/tests/${file}: allowlist says ${entry.count}, found ${count}. ` +
            `Lower the count in blindWaitGuard.test.ts (or remove the entry at 0).`,
        );
      }
    }

    expect(
      stale,
      `Good news: some fixed-time waits were removed. Shrink the allowlist to match:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("recognizes both blind-wait shapes and skips test budgets", () => {
    expect(countBlindWaits("await page.waitForTimeout(500);")).toBe(1);
    expect(
      countBlindWaits("await new Promise((r) => setTimeout(r, 100));"),
    ).toBe(1);
    expect(countBlindWaits("test.setTimeout(120_000);")).toBe(0);
    expect(countBlindWaits("page.setDefaultTimeout(5_000);")).toBe(0);
  });
});
