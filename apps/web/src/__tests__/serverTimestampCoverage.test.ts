import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const migrationsDir = resolve(repoRoot, "supabase/migrations");

// Every user-owned table that stores a `created_at` MUST have a
// BEFORE INSERT trigger forcing created_at = now() server-side, so a client
// clock can never forge it (migration 20260704160000). This guard locks that
// in: a future table cannot silently reintroduce a client-forgeable created_at.
const EXPECTED_CREATED_AT_TABLES = [
  "ai_call_traces",
  "areas",
  "brief_views",
  "calendar_blocks",
  "capture_items",
  "execution_sessions",
  "external_write_events",
  "google_calendar_connections",
  "operator_profiles",
  "override_records",
  "people",
  "projects",
  "review_entries",
  "rollup_summaries",
  "suggestion_records",
  "tasks",
  "time_block_proposals",
  "win_records",
];

// Tables that intentionally use a different clock column (no created_at), so
// they are correctly outside the invariant above.
const EXEMPT_TABLES = [
  "duration_profiles",
  "health_checks",
  "health_incidents",
];

function loadAllMigrationsSql(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
    .join("\n");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface CreateTableBlock {
  name: string;
  body: string;
}

// Extract the balanced `( ... )` column list of every
// `create table [if not exists] public.<name> (` statement, mirroring the
// balanced-brace scan in motion.test.ts.
function createTableBlocks(sql: string): CreateTableBlock[] {
  const blocks: CreateTableBlock[] = [];
  const header = /create table (?:if not exists )?public\.([a-z0-9_]+)\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = header.exec(sql)) !== null) {
    const name = match[1];
    // match[0] ends with the opening "(" thanks to the trailing `\s*\(`.
    const openParen = match.index + match[0].length - 1;
    let depth = 0;
    let bodyStart = -1;

    for (let index = openParen; index < sql.length; index += 1) {
      const char = sql[index];

      if (char === "(") {
        if (depth === 0) {
          bodyStart = index + 1;
        }
        depth += 1;
      } else if (char === ")") {
        depth -= 1;

        if (depth === 0) {
          blocks.push({ name, body: sql.slice(bodyStart, index) });
          break;
        }
      }
    }
  }

  return blocks;
}

function tablesWithCreatedAtInCreateBlock(sql: string): string[] {
  return createTableBlocks(sql)
    .filter(({ body }) => /\bcreated_at\b/i.test(body))
    .map(({ name }) => name);
}

// Tables that gain a `created_at` column later via
// `alter table public.<name> ... add column [if not exists] created_at ...`.
// Scanned per-statement (split on `;`) so a covering trigger added in a
// different migration still counts, and so multi-column ALTERs (created_at not
// first) are still detected — `add column created_at` is a substring either
// way. The repo is additive-only (NS-INV-2), so a later column drop is not
// modelled. Without this, a future ALTER-added created_at would slip the
// create-table-only scan and reintroduce a client-forgeable timestamp.
function tablesAddingCreatedAtViaAlter(sql: string): string[] {
  const names = new Set<string>();

  for (const rawStatement of sql.split(";")) {
    const statement = normalizeWhitespace(rawStatement).toLowerCase();
    const nameMatch = statement.match(
      /alter table (?:if exists )?(?:only )?public\.([a-z0-9_]+)\b/,
    );

    if (
      nameMatch &&
      /\badd column (?:if not exists )?created_at\b/.test(statement)
    ) {
      names.add(nameMatch[1]);
    }
  }

  return [...names];
}

function tablesDeclaringCreatedAt(sql: string): string[] {
  return [
    ...new Set([
      ...tablesWithCreatedAtInCreateBlock(sql),
      ...tablesAddingCreatedAtViaAlter(sql),
    ]),
  ];
}

// Names of tables that declare a `created_at` column but lack a covering
// server-authoritative BEFORE INSERT trigger.
function uncoveredCreatedAtTables(sql: string): string[] {
  const normalized = normalizeWhitespace(sql).toLowerCase();

  return tablesDeclaringCreatedAt(sql).filter((name) => {
    const trigger = new RegExp(
      `create trigger [a-z0-9_]+ before insert(?: or update)? on public\\.${name} ` +
        `for each row execute (?:function|procedure) ` +
        `public\\.(?:set_server_created_at|set_server_row_timestamps)\\(\\)`,
    );

    return !trigger.test(normalized);
  });
}

describe("server-authoritative created_at coverage", () => {
  it("covers every created_at table with a BEFORE INSERT server-timestamp trigger", () => {
    const uncovered = uncoveredCreatedAtTables(loadAllMigrationsSql());

    expect(
      uncovered,
      `Tables declaring created_at without a set_server_created_at / ` +
        `set_server_row_timestamps BEFORE INSERT trigger: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("discovers exactly the known created_at tables (drift alarm on new tables)", () => {
    // Also guards against a silent vacuous pass: if the parser broke and found
    // zero tables, the coverage test would pass empty — this test would not.
    const discovered = tablesDeclaringCreatedAt(loadAllMigrationsSql()).sort();

    expect(discovered).toEqual([...EXPECTED_CREATED_AT_TABLES].sort());
  });

  it("does not flag tables that use a different clock column", () => {
    const sql = loadAllMigrationsSql();
    const tableNames = createTableBlocks(sql).map(({ name }) => name);
    const uncovered = uncoveredCreatedAtTables(sql);

    for (const exempt of EXEMPT_TABLES) {
      expect(tableNames).toContain(exempt);
      expect(uncovered).not.toContain(exempt);
    }
  });

  it("has teeth: reports an uncovered created_at table (negative control)", () => {
    const forged = `
      create table public.forged_x (
        id uuid primary key,
        user_id uuid not null,
        created_at timestamptz not null default now()
      );
    `;

    expect(uncoveredCreatedAtTables(forged)).toEqual(["forged_x"]);
  });

  it("accepts a properly covered created_at table (positive control)", () => {
    const covered = `
      create table public.covered_x (
        id uuid primary key,
        created_at timestamptz not null default now()
      );
      create trigger covered_x_set_server_created_at
        before insert on public.covered_x
        for each row execute function public.set_server_created_at();
    `;

    expect(uncoveredCreatedAtTables(covered)).toEqual([]);
  });

  it("has teeth for an ALTER-added created_at: reports it uncovered (negative control)", () => {
    // A created_at introduced later on an existing table must ALSO be covered —
    // the create-table scan alone would miss this.
    const forged = `
      create table public.altered_x (
        id uuid primary key,
        user_id uuid not null
      );
      alter table public.altered_x
        add column created_at timestamptz not null default now();
    `;

    expect(uncoveredCreatedAtTables(forged)).toEqual(["altered_x"]);
  });

  it("accepts an ALTER-added created_at with a covering trigger, even as a non-first column", () => {
    const covered = `
      create table public.altered_ok (
        id uuid primary key
      );
      alter table public.altered_ok
        add column note text,
        add column created_at timestamptz not null default now();
      create trigger altered_ok_set_server_created_at
        before insert on public.altered_ok
        for each row execute function public.set_server_row_timestamps();
    `;

    expect(uncoveredCreatedAtTables(covered)).toEqual([]);
  });
});
