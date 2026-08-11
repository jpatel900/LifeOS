#!/usr/bin/env node
// Runs both dependency-cruiser cruises (apps/web, packages/*) that back the
// architecture-boundary rules in .dependency-cruiser.cjs, and adds a
// vacuous-pass guard on top of dependency-cruiser's own exit code: a cruise
// that silently parses zero (or near-zero) files still exits 0 with 0
// violations -- indistinguishable from a genuinely clean tree unless module
// counts are checked too. See the "KNOWN SETUP TRAPS" note in the PR that
// introduced this script (npx-installed dependency-cruiser can't resolve
// this repo's TypeScript because pnpm doesn't hoist, and silently cruises
// zero .ts files while exiting 0 -- this script's minModules assertion is
// what catches that class of failure in CI).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const depcruiseBin = join(
  repoRoot,
  "node_modules",
  "dependency-cruiser",
  "bin",
  "dependency-cruise.mjs",
);

function packageSrcDirs() {
  const packagesDir = join(repoRoot, "packages");
  return readdirSync(packagesDir)
    .filter((name) => statSync(join(packagesDir, name)).isDirectory())
    .map((name) => `packages/${name}/src`)
    .filter((relPath) => existsSync(join(repoRoot, relPath)));
}

const targets = [
  {
    label: "apps/web",
    minModules: 500,
    args: [
      "--config",
      ".dependency-cruiser.cjs",
      "--ts-config",
      join(repoRoot, "apps", "web", "tsconfig.depcruise.json"),
      "--output-type",
      "json",
      "apps/web/src",
    ],
  },
  {
    label: "packages",
    minModules: 20,
    args: [
      "--config",
      ".dependency-cruiser.cjs",
      "--output-type",
      "json",
      ...packageSrcDirs(),
    ],
  },
];

function runCruise(target) {
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [depcruiseBin, ...target.args], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // dependency-cruiser exits 1 when it finds error-severity violations;
    // the JSON report is still on stdout in that case.
    if (typeof error.stdout === "string" && error.stdout.length > 0) {
      stdout = error.stdout;
    } else {
      throw error;
    }
  }
  return JSON.parse(stdout);
}

function printViolations(label, violations) {
  const byRule = new Map();
  for (const violation of violations) {
    const key = `${violation.rule.severity}:${violation.rule.name}`;
    if (!byRule.has(key)) byRule.set(key, []);
    byRule.get(key).push(`${violation.from} -> ${violation.to}`);
  }
  for (const [key, edges] of byRule) {
    const [severity, name] = key.split(":");
    console.log(`  [${severity}] ${name}: ${edges.length} offender(s)`);
    for (const edge of edges) console.log(`    - ${edge}`);
  }
}

let failed = false;

for (const target of targets) {
  console.log(`\n=== depcruise: ${target.label} ===`);
  const result = runCruise(target);
  const { error, warn, totalCruised, totalDependenciesCruised, violations } =
    result.summary;

  console.log(
    `${target.label}: ${totalCruised} modules, ${totalDependenciesCruised} dependencies cruised, ` +
      `${error} error(s), ${warn} warning(s)`,
  );

  if (violations && violations.length > 0) {
    printViolations(target.label, violations);
  }

  if (totalCruised < target.minModules) {
    console.error(
      `FAIL [${target.label}]: vacuous-pass guard tripped -- cruised only ` +
        `${totalCruised} modules, expected at least ${target.minModules}. ` +
        "This is the signature of a cruise that silently resolved nothing " +
        "(e.g. TypeScript unresolvable from this process, or the wrong " +
        "target path) while still exiting 0. Treat as a failure, not a " +
        "pass.",
    );
    failed = true;
  }

  if (error > 0) {
    console.error(
      `FAIL [${target.label}]: ${error} error-severity dependency-cruiser violation(s) above.`,
    );
    failed = true;
  }
}

if (failed) {
  console.error("\ndepcruise: FAILED");
  process.exitCode = 1;
} else {
  console.log(
    "\ndepcruise: PASSED (error-severity rules clean; see warnings above, if any)",
  );
}
