#!/usr/bin/env node

// Pre-merge guard for issue #776: fail a PR whose new supabase/migrations
// timestamp collides with a migration already on the base branch. Supabase's
// migration table records one applied version per timestamp, so a duplicate
// merged to main makes production silently skip one file (#762/#764, fixed by
// #773). The post-merge guard in supabaseMigration.test.ts catches this only
// after main is red; this script runs in PR CI so the duplicate never merges.
//
// Dependency-free by design, like check-safe-automerge.mjs, so the job never
// needs pnpm install.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

const MIGRATIONS_DIR = "supabase/migrations/";
const TIMESTAMP_PATTERN = /^(\d{14})_/;

function timestampOf(path) {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const match = filename.match(TIMESTAMP_PATTERN);
  return match ? match[1] : null;
}

/**
 * The merged tree's migrations are (base − deleted) ∪ added. A collision is a
 * timestamp shared by two files in that set where at least one file is added
 * by the PR — duplicates that already exist on the base branch alone are the
 * post-merge guard's business, not this PR's fault.
 */
export function findCollisions({ baseFiles, addedFiles, deletedFiles }) {
  const deleted = new Set(deletedFiles);
  const survivingBase = baseFiles.filter((file) => !deleted.has(file));

  const collisions = [];
  for (const added of addedFiles) {
    const timestamp = timestampOf(added);
    if (!timestamp) {
      continue;
    }

    for (const existing of survivingBase) {
      if (existing !== added && timestampOf(existing) === timestamp) {
        collisions.push({ timestamp, added, existing });
      }
    }

    for (const other of addedFiles) {
      if (other < added && timestampOf(other) === timestamp) {
        collisions.push({ timestamp, added, existing: other });
      }
    }
  }

  return collisions;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}

function collectContext(baseRef) {
  const baseFiles = git([
    "ls-tree",
    "--name-only",
    baseRef,
    MIGRATIONS_DIR,
  ]).filter((file) => file.endsWith(".sql"));

  // --no-renames so a `git mv` (like #773's fix) shows as delete + add and the
  // deleted old name stops counting as a base-branch occupant of its timestamp.
  const diffNames = (filter) =>
    git([
      "diff",
      "--name-only",
      "--no-renames",
      `--diff-filter=${filter}`,
      `${baseRef}...HEAD`,
      "--",
      MIGRATIONS_DIR,
    ]).filter((file) => file.endsWith(".sql"));

  return {
    baseFiles,
    addedFiles: diffNames("A"),
    deletedFiles: diffNames("D"),
  };
}

function report(collisions) {
  if (collisions.length === 0) {
    console.log("No migration timestamp collisions with the base branch.");
    return;
  }

  for (const { timestamp, added, existing } of collisions) {
    console.error(
      [
        `Migration timestamp collision: this PR adds`,
        `  ${added}`,
        `which uses the same leading timestamp (${timestamp}) as`,
        `  ${existing}`,
        `Supabase records one applied migration per timestamp, so after merge`,
        `production would silently skip one of these files (this broke prod on`,
        `2026-07-26 via #762/#764). Rename the new file with a later, unique`,
        `timestamp, e.g. \`git mv\` it to a version after the newest one on main.`,
        ``,
      ].join("\n"),
    );
  }

  process.exit(1);
}

function runSelfTest() {
  const cases = [
    {
      name: "no collision passes",
      input: {
        baseFiles: ["supabase/migrations/20260101120000_one.sql"],
        addedFiles: ["supabase/migrations/20260102120000_two.sql"],
        deletedFiles: [],
      },
      expectedCount: 0,
    },
    {
      name: "added file colliding with base file is caught",
      input: {
        baseFiles: [
          "supabase/migrations/20260726140000_grant_authenticated.sql",
        ],
        addedFiles: [
          "supabase/migrations/20260726140000_add_session_transition.sql",
        ],
        deletedFiles: [],
      },
      expectedCount: 1,
    },
    {
      name: "two added files sharing a timestamp are caught",
      input: {
        baseFiles: [],
        addedFiles: [
          "supabase/migrations/20260726140000_a.sql",
          "supabase/migrations/20260726140000_b.sql",
        ],
        deletedFiles: [],
      },
      expectedCount: 1,
    },
    {
      name: "rename (delete + add, same timestamp) is not a collision",
      input: {
        baseFiles: ["supabase/migrations/20260726140000_old_name.sql"],
        addedFiles: ["supabase/migrations/20260726140000_new_name.sql"],
        deletedFiles: ["supabase/migrations/20260726140000_old_name.sql"],
      },
      expectedCount: 0,
    },
    {
      name: "pre-existing duplicate on base alone is not this PR's failure",
      input: {
        baseFiles: [
          "supabase/migrations/20260726140000_a.sql",
          "supabase/migrations/20260726140000_b.sql",
        ],
        addedFiles: ["supabase/migrations/20260727120000_c.sql"],
        deletedFiles: [],
      },
      expectedCount: 0,
    },
    {
      name: "file without a timestamp prefix is ignored",
      input: {
        baseFiles: ["supabase/migrations/20260101120000_one.sql"],
        addedFiles: ["supabase/migrations/notes.sql"],
        deletedFiles: [],
      },
      expectedCount: 0,
    },
  ];

  for (const testCase of cases) {
    const collisions = findCollisions(testCase.input);
    assert.equal(
      collisions.length,
      testCase.expectedCount,
      `${testCase.name}: expected ${testCase.expectedCount} collision(s), got ${collisions.length}`,
    );
  }

  console.log(`Self-test passed (${cases.length} cases).`);
}

function main() {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
    return;
  }

  const baseFlagIndex = process.argv.indexOf("--base");
  const baseRef =
    baseFlagIndex !== -1 ? process.argv[baseFlagIndex + 1] : undefined;

  if (!baseRef) {
    console.error(
      "Usage: check-migration-collision.mjs --base <ref> | --self-test",
    );
    process.exit(2);
  }

  report(findCollisions(collectContext(baseRef)));
}

main();
