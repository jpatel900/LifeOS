import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const migrationsDir = resolve(repoRoot, "supabase", "migrations");
const sharedWorkflowFile = resolve(
  repoRoot,
  "apps",
  "web",
  "src",
  "lib",
  "data",
  "workflow",
  "shared.ts",
);

const columnConstantMappings = [
  { constantName: "taskColumns", tableName: "tasks" },
  { constantName: "areaColumns", tableName: "areas" },
  { constantName: "captureColumns", tableName: "capture_items" },
  {
    constantName: "timeBlockProposalColumns",
    tableName: "time_block_proposals",
  },
  { constantName: "calendarBlockColumns", tableName: "calendar_blocks" },
  { constantName: "executionSessionColumns", tableName: "execution_sessions" },
  { constantName: "reviewEntryColumns", tableName: "review_entries" },
] as const;

const computedSelectionAllowlist = new Set<string>();
const ignoredCreateTableEntries = new Set([
  "check",
  "constraint",
  "exclude",
  "foreign",
  "primary",
  "unique",
]);

function loadAllMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(resolve(migrationsDir, file), "utf8"))
    .join("\n");
}

function loadColumnConstants() {
  const sharedWorkflowSource = readFileSync(sharedWorkflowFile, "utf8");

  return columnConstantMappings.map(({ constantName, tableName }) => {
    const match = sharedWorkflowSource.match(
      new RegExp(`export\\s+const\\s+${constantName}\\s*=\\s*"([^"]+)"`, "u"),
    );

    expect(
      match,
      `${constantName} must be exported from workflow/shared.ts`,
    ).not.toBeNull();
    return { constantName, tableName, columns: match![1] };
  });
}

function normalizeIdentifier(identifier: string) {
  return identifier
    .replace(/^public\./i, "")
    .replace(/"/g, "")
    .toLowerCase();
}

function splitSqlList(value: string) {
  const entries: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(depth - 1, 0);

    if (char === "," && depth === 0) {
      entries.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) entries.push(current.trim());
  return entries;
}

function extractFirstIdentifier(value: string) {
  return value.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?/u)?.[1]?.toLowerCase();
}

function addColumn(
  columnsByTable: Map<string, Set<string>>,
  table: string,
  column: string,
) {
  const tableColumns = columnsByTable.get(table) ?? new Set<string>();
  tableColumns.add(column);
  columnsByTable.set(table, tableColumns);
}

function extractAlterTableAddedColumns(sql: string) {
  const columnsByTable = new Map<string, Set<string>>();
  const alterTablePattern =
    /alter\s+table\s+(?:if\s+exists\s+)?((?:public\.)?"?[a-zA-Z_][a-zA-Z0-9_]*"?)\s+([\s\S]*?);/gi;

  for (const alterMatch of sql.matchAll(alterTablePattern)) {
    const tableName = normalizeIdentifier(alterMatch[1]);
    const addColumnPattern =
      /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;

    for (const addMatch of alterMatch[2].matchAll(addColumnPattern)) {
      addColumn(columnsByTable, tableName, addMatch[1].toLowerCase());
    }
  }

  return columnsByTable;
}

function extractCreatedColumns(sql: string) {
  const columnsByTable = new Map<string, Set<string>>();
  const createTablePattern =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public\.)?"?[a-zA-Z_][a-zA-Z0-9_]*"?)\s*\(([\s\S]*?)\);/gi;

  for (const match of sql.matchAll(createTablePattern)) {
    const tableName = normalizeIdentifier(match[1]);
    for (const entry of splitSqlList(match[2])) {
      const columnName = extractFirstIdentifier(entry);
      if (!columnName || ignoredCreateTableEntries.has(columnName)) continue;
      addColumn(columnsByTable, tableName, columnName);
    }
  }

  for (const [tableName, columnNames] of extractAlterTableAddedColumns(sql)) {
    for (const columnName of columnNames) {
      addColumn(columnsByTable, tableName, columnName);
    }
  }

  return columnsByTable;
}

function parseSelectedColumns(columns: string, constantName: string) {
  return columns
    .split(",")
    .map((column) => {
      const trimmedColumn = column.trim();
      const allowlistKey = `${constantName}:${trimmedColumn}`;
      if (computedSelectionAllowlist.has(allowlistKey)) return null;
      expect(
        trimmedColumn,
        `${constantName} must not include empty selections`,
      ).not.toBe("");
      expect(
        /^[a-z_][a-z0-9_]*$/u.test(trimmedColumn),
        `${constantName} selection '${trimmedColumn}' must be a plain column or explicitly allowlisted`,
      ).toBe(true);
      return trimmedColumn.toLowerCase();
    })
    .filter((column): column is string => column !== null);
}

describe("workflow column constants match Supabase migrations", () => {
  it("selects only columns created or added by migrations", () => {
    const columnsByTable = extractCreatedColumns(loadAllMigrationSql());

    for (const { constantName, tableName, columns } of loadColumnConstants()) {
      const migratedColumns =
        columnsByTable.get(tableName) ?? new Set<string>();

      for (const selectedColumn of parseSelectedColumns(
        columns,
        constantName,
      )) {
        expect(
          migratedColumns.has(selectedColumn),
          `${constantName} selects missing migration column '${tableName}.${selectedColumn}'`,
        ).toBe(true);
      }
    }
  });
});
