#!/usr/bin/env node

// The comparison logic behind .github/workflows/migration-drift.yml. Checks
// supabase/migrations/*.sql against production's
// supabase_migrations.schema_migrations ledger in BOTH directions:
//
//   (a) repo-ahead: a repo migration file with no matching version in prod
//       (the ORIGINAL behavior of this check — unchanged).
//   (b) prod-ahead: a prod ledger version with no matching repo file — the
//       database has a change this repo has no record of. This direction did
//       not exist before 2026-08-21. It is why
//       20260718184244_security_harden_functions was applied by hand to
//       production on 2026-07-18 and sat there, completely undetected, for a
//       month — the one-directional check could not see it (docs/FAILURES.md).
//
// This Supabase project is SHARED with the RiseUp Cockpit project, whose own
// pipeline applies migrations directly to the same database. Those versions
// (and one historical remote-schema dump, already closed) are expected and
// listed in scripts/agent/migration-drift-allowlist.mjs with a reason each.
// A prod-only version NOT on that list still fails this check loudly — the
// allowlist explains known drift, it never hides unknown drift.
//
// Dependency-free by design, like check-migration-collision.mjs: this job
// never needs pnpm install.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import { MIGRATION_DRIFT_ALLOWLIST } from "./migration-drift-allowlist.mjs";

const MIGRATION_FILENAME_PATTERN = /^(\d{14})_(.+)\.sql$/;
const LEDGER_LINE_PATTERN = /^(\d{14})\t(.+)$/;

/**
 * Reads supabase/migrations/<dir>/*.sql and splits each filename into
 * {version, name}. A filename that doesn't match the timestamp pattern is
 * NOT silently skipped — it comes back in `malformed` so the caller can fail
 * loudly instead of quietly excluding it from comparison.
 */
export function readLocalMigrations(migrationsDir, listFn = readdirSync) {
  const files = listFn(migrationsDir).filter((file) => file.endsWith(".sql"));
  const entries = [];
  const malformed = [];

  for (const file of files) {
    const match = file.match(MIGRATION_FILENAME_PATTERN);
    if (!match) {
      malformed.push(file);
      continue;
    }
    entries.push({ version: match[1], name: match[2] });
  }

  return { entries, malformed };
}

/**
 * Parses `version<TAB>name` lines (what the workflow's psql call produces).
 * A line that doesn't parse is NOT silently dropped — same reasoning as
 * readLocalMigrations above.
 */
export function parseLedgerLines(lines) {
  const entries = [];
  const malformed = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(LEDGER_LINE_PATTERN);
    if (!match) {
      malformed.push(rawLine);
      continue;
    }
    entries.push({ version: match[1], name: match[2] });
  }

  return { entries, malformed };
}

/**
 * Pure comparison. `local` and `remote` are arrays of {version, name};
 * `allowlist` is an array of {version, name, reason}.
 */
export function computeDrift({ local, remote, allowlist }) {
  const remoteVersions = new Set(remote.map((entry) => entry.version));
  const localVersions = new Set(local.map((entry) => entry.version));
  const allowlistVersions = new Set(allowlist.map((entry) => entry.version));

  const byVersion = (a, b) => a.version.localeCompare(b.version);

  const missingFromProd = local
    .filter((entry) => !remoteVersions.has(entry.version))
    .sort(byVersion);

  const prodOnly = remote
    .filter((entry) => !localVersions.has(entry.version))
    .sort(byVersion);

  const prodOnlyUnexplained = prodOnly.filter(
    (entry) => !allowlistVersions.has(entry.version),
  );
  const prodOnlyKnown = prodOnly.filter((entry) =>
    allowlistVersions.has(entry.version),
  );

  return { missingFromProd, prodOnlyUnexplained, prodOnlyKnown };
}

function formatEntry({ version, name }) {
  return `  ${version}_${name}`;
}

/**
 * Prints the report and returns whether the check passed. Kept separate
 * from computeDrift so the self-test can assert on data, not console output.
 */
export function report(
  { missingFromProd, prodOnlyUnexplained, prodOnlyKnown },
  totalLocal,
) {
  let ok = true;

  if (missingFromProd.length > 0) {
    ok = false;
    console.error(
      "::error::Production is missing these repo migrations. Response procedure: " +
        ".agents/skills/lifeos-migration-drift-response/SKILL.md (assemble one transaction " +
        "from the files below + ledger insert; human-gated apply):",
    );
    for (const entry of missingFromProd) console.error(formatEntry(entry));
  }

  if (prodOnlyUnexplained.length > 0) {
    ok = false;
    console.error(
      "::error::The database has changes this repo has no record of. Production's migration " +
        "ledger lists version(s) below with no matching file under supabase/migrations/. This " +
        "is exactly how 20260718184244_security_harden_functions sat unseen in production for a " +
        "month (docs/FAILURES.md). For each version: either (a) it is a genuine LifeOS change " +
        "applied by hand — write a catch-up migration file that reproduces it (see PR #896 for " +
        "the pattern), or (b) it is expected (e.g. a different project sharing this Supabase " +
        "instance) — add it to scripts/agent/migration-drift-allowlist.mjs with a one-line " +
        "reason. Response procedure: .agents/skills/lifeos-migration-drift-response/SKILL.md:",
    );
    for (const entry of prodOnlyUnexplained) console.error(formatEntry(entry));
  }

  if (ok) {
    console.log(
      `Production has all ${totalLocal} repo migrations, and every prod-only version ` +
        `(${prodOnlyKnown.length}) is accounted for in scripts/agent/migration-drift-allowlist.mjs.`,
    );
  }

  return ok;
}

function runSelfTest() {
  const entry = (version, name) => ({ version, name });

  const dataCases = [
    {
      name: "no drift in either direction passes",
      input: {
        local: [entry("20260101120000", "one")],
        remote: [entry("20260101120000", "one")],
        allowlist: [],
      },
      expect: { missingFromProd: 0, prodOnlyUnexplained: 0, prodOnlyKnown: 0 },
    },
    {
      name: "repo-ahead (missing from prod) is still reported — regression guard for the ORIGINAL direction",
      input: {
        local: [entry("20260101120000", "one"), entry("20260102120000", "two")],
        remote: [entry("20260101120000", "one")],
        allowlist: [],
      },
      expect: { missingFromProd: 1, prodOnlyUnexplained: 0, prodOnlyKnown: 0 },
    },
    {
      name: "prod-only version on the allowlist is filtered out, not reported as unexplained",
      input: {
        local: [entry("20260101120000", "one")],
        remote: [
          entry("20260101120000", "one"),
          entry("20260612231853", "remote_schema"),
        ],
        allowlist: [
          {
            version: "20260612231853",
            name: "remote_schema",
            reason: "documented in FAILURES.md",
          },
        ],
      },
      expect: { missingFromProd: 0, prodOnlyUnexplained: 0, prodOnlyKnown: 1 },
    },
    {
      name: "prod-only version NOT on the allowlist fails loudly — the planted-violation case",
      input: {
        local: [entry("20260101120000", "one")],
        remote: [
          entry("20260101120000", "one"),
          entry("20260821999999", "mystery_change"),
        ],
        allowlist: [],
      },
      expect: { missingFromProd: 0, prodOnlyUnexplained: 1, prodOnlyKnown: 0 },
    },
    {
      name: "both directions can fire in the same run",
      input: {
        local: [
          entry("20260101120000", "one"),
          entry("20260103120000", "repo_only"),
        ],
        remote: [
          entry("20260101120000", "one"),
          entry("20260821999999", "mystery_change"),
        ],
        allowlist: [],
      },
      expect: { missingFromProd: 1, prodOnlyUnexplained: 1, prodOnlyKnown: 0 },
    },
  ];

  for (const testCase of dataCases) {
    const drift = computeDrift(testCase.input);
    assert.equal(
      drift.missingFromProd.length,
      testCase.expect.missingFromProd,
      `${testCase.name}: missingFromProd`,
    );
    assert.equal(
      drift.prodOnlyUnexplained.length,
      testCase.expect.prodOnlyUnexplained,
      `${testCase.name}: prodOnlyUnexplained`,
    );
    assert.equal(
      drift.prodOnlyKnown.length,
      testCase.expect.prodOnlyKnown,
      `${testCase.name}: prodOnlyKnown`,
    );
  }

  // Vacuous-pass guards: a malformed entry must be flagged, never silently
  // dropped from the comparison (that would let real drift slip through).
  const { entries: parsedOk, malformed: malformedOk } = parseLedgerLines([
    "20260101120000\tone",
    "20260102120000\ttwo",
  ]);
  assert.equal(parsedOk.length, 2, "well-formed ledger lines all parse");
  assert.equal(
    malformedOk.length,
    0,
    "well-formed ledger lines have no malformed entries",
  );

  const { entries: parsedBad, malformed: malformedBad } = parseLedgerLines([
    "20260101120000\tone",
    "FATAL: connection to server failed",
  ]);
  assert.equal(
    parsedBad.length,
    1,
    "a bad line does not get counted as a valid version",
  );
  assert.equal(
    malformedBad.length,
    1,
    "an unparseable ledger line is flagged as malformed, not silently skipped",
  );

  const { entries: filesOk, malformed: filesMalformedOk } = readLocalMigrations(
    ".",
    () => ["20260101120000_one.sql", "20260102120000_two.sql"],
  );
  assert.equal(filesOk.length, 2, "well-formed migration filenames all parse");
  assert.equal(
    filesMalformedOk.length,
    0,
    "well-formed migration filenames have no malformed entries",
  );

  const { entries: filesBad, malformed: filesMalformedBad } =
    readLocalMigrations(".", () => ["20260101120000_one.sql", "notes.sql"]);
  assert.equal(
    filesBad.length,
    1,
    "a file without a valid timestamp prefix does not get counted",
  );
  assert.equal(
    filesMalformedBad.length,
    1,
    "a migration filename that doesn't match the timestamp pattern is flagged as malformed, not silently skipped",
  );

  // The allowlist itself must stay auditable: every entry needs a real
  // reason, not a placeholder. This guards the artifact this task created.
  assert.ok(
    MIGRATION_DRIFT_ALLOWLIST.length >= 11,
    "the real allowlist should still contain at least the 11 known entries (1 remote_schema + 10 riseup_*)",
  );
  for (const allowlistEntry of MIGRATION_DRIFT_ALLOWLIST) {
    assert.match(
      allowlistEntry.version,
      /^\d{14}$/,
      `allowlist entry ${JSON.stringify(allowlistEntry)} has a well-formed version`,
    );
    assert.ok(
      typeof allowlistEntry.reason === "string" &&
        allowlistEntry.reason.length > 20,
      `allowlist entry for ${allowlistEntry.version} (${allowlistEntry.name}) must carry a real reason, not a placeholder`,
    );
  }

  console.log(
    `Self-test passed (${dataCases.length} comparison cases, 4 vacuous-pass guards, ` +
      `${MIGRATION_DRIFT_ALLOWLIST.length} allowlist entries validated).`,
  );
}

function loadRemoteLedger(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return parseLedgerLines(raw.split(/\r?\n/));
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const remoteFlagIndex = process.argv.indexOf("--remote-file");
  const remoteFile =
    remoteFlagIndex !== -1 ? process.argv[remoteFlagIndex + 1] : undefined;
  const dirFlagIndex = process.argv.indexOf("--migrations-dir");
  const migrationsDir =
    dirFlagIndex !== -1
      ? process.argv[dirFlagIndex + 1]
      : "supabase/migrations";

  if (!remoteFile) {
    console.error(
      "Usage: check-migration-drift.mjs --remote-file <path> [--migrations-dir <path>] | --self-test",
    );
    process.exit(2);
  }

  const { entries: local, malformed: malformedLocal } =
    readLocalMigrations(migrationsDir);
  const { entries: remote, malformed: malformedRemote } =
    loadRemoteLedger(remoteFile);

  // Vacuous-pass guards. An empty or unreadable side must never be silently
  // read as "zero drift" — that is a worse failure than a false alarm.
  if (local.length === 0) {
    console.error(
      `::error::No local migrations found under ${migrationsDir}/*.sql. Either the glob failed ` +
        'to expand or the directory is empty/missing. This must never be read as "zero drift" ' +
        "— refusing to compare.",
    );
    process.exit(1);
  }

  if (remote.length === 0) {
    console.error(
      "::error::The production migration ledger came back with zero rows. " +
        "supabase_migrations.schema_migrations can never legitimately be empty for this project " +
        "— zero rows means the query or connection failed, not that production has no " +
        "migrations. Refusing to compare.",
    );
    process.exit(1);
  }

  if (malformedLocal.length > 0) {
    console.error(
      `::error::These files under ${migrationsDir}/ do not match the <14-digit-timestamp>_<name>.sql ` +
        "pattern, so they would otherwise be silently excluded from every comparison above. " +
        "Fix the filename or investigate why it's there:",
    );
    for (const file of malformedLocal) console.error(`  ${file}`);
    process.exit(1);
  }

  if (malformedRemote.length > 0) {
    console.error(
      "::error::These lines from the production ledger did not parse as <version><TAB><name> and " +
        "would otherwise be silently excluded from comparison (this usually means psql failed, or " +
        "the query's column shape changed):",
    );
    for (const line of malformedRemote) console.error(`  ${line}`);
    process.exit(1);
  }

  const drift = computeDrift({
    local,
    remote,
    allowlist: MIGRATION_DRIFT_ALLOWLIST,
  });
  const ok = report(drift, local.length);
  process.exit(ok ? 0 : 1);
}

main();
