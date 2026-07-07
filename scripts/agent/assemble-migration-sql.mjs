#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const HEADER_RULE =
  "-- ============================================================================";

function sqlString(value) {
  return String(value).replaceAll("'", "''");
}

function trimTrailingWhitespace(value) {
  return String(value).replace(/[\s]+$/u, "");
}

export function assembleDriftFixSql(migrations, options) {
  const date = options?.date;
  const sections = ["begin;", ""];

  for (const migration of migrations) {
    sections.push(HEADER_RULE);
    sections.push(`-- ${migration.version}_${migration.name}.sql`);
    sections.push(HEADER_RULE);
    sections.push(trimTrailingWhitespace(migration.body));
    sections.push("");
  }

  sections.push(HEADER_RULE);
  sections.push(
    "-- Ledger registration (mandatory — the drift check reads these version rows)",
  );
  sections.push(HEADER_RULE);
  sections.push(
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
  );
  sections.push("values");

  migrations.forEach((migration, index) => {
    const terminator = index === migrations.length - 1 ? ";" : ",";
    sections.push(
      `  ('${sqlString(migration.version)}', '${sqlString(migration.name)}', array['applied via drift-response runbook ${sqlString(date)}'])${terminator}`,
    );
  });

  sections.push("");
  sections.push("commit;");

  return sections.join("\n");
}

function parseMigrationFilename(path) {
  const filename = basename(path);
  const match = /^(\d{14})_(.+)\.sql$/u.exec(filename);

  if (!match) {
    throw new Error(
      `Bad migration filename: ${filename}. Expected <14-digit-version>_<name>.sql.`,
    );
  }

  return { version: match[1], name: match[2] };
}

async function main(argv) {
  const filePaths = [];
  let date = new Date().toISOString().slice(0, 10);

  for (const arg of argv) {
    if (arg.startsWith("--date=")) {
      date = arg.slice("--date=".length);
    } else {
      filePaths.push(arg);
    }
  }

  const migrations = [];

  for (const path of filePaths) {
    const { version, name } = parseMigrationFilename(path);
    migrations.push({
      version,
      name,
      body: await readFile(path, "utf8"),
    });
  }

  process.stdout.write(assembleDriftFixSql(migrations, { date }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
