import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const workflowModulesPath = resolve(repoRoot, "apps/web/src/lib/data/workflow");
const workflowBarrelPath = resolve(
  repoRoot,
  "apps/web/src/lib/data/workflow.ts",
);

const INTENTIONALLY_INTERNAL_EXPORTS = new Set<string>([
  "metaLearning:recordOverrideFireAndForget",
  "metaLearning:recordSuggestionFireAndForget",
  "metaLearning:uuidPattern",
  "shared:durationProfileColumns",
  "shared:getSupabaseMessage",
  "shared:logLearningWriteFailure",
  "shared:mockUserId",
  "shared:overrideRecordColumns",
  "shared:parseAreas",
  "shared:parseCalendarBlock",
  "shared:parseCalendarBlocks",
  "shared:parseCapture",
  "shared:parseCaptures",
  "shared:parseDurationProfile",
  "shared:parseDurationProfiles",
  "shared:parseExecutionSession",
  "shared:parseExecutionSessions",
  "shared:parseProject",
  "shared:parseReviewEntries",
  "shared:parseReviewEntry",
  "shared:parseRollupSummaries",
  "shared:parseRollupSummary",
  "shared:parseTask",
  "shared:parseTasks",
  "shared:parseTimeBlockProposal",
  "shared:parseTimeBlockProposals",
  "shared:parseWinRecord",
  "shared:parseWinRecords",
  "shared:projectColumns",
  "shared:requireSupabaseUser",
  "shared:rollupSummaryColumns",
  "shared:suggestionRecordColumns",
  "shared:uniqueAreaSlug",
  "shared:winRecordColumns",
]);

function readWorkflowModules(): Map<string, Set<string>> {
  return new Map(
    readdirSync(workflowModulesPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const moduleName = basename(entry.name, ".ts");
        const contents = readFileSync(
          resolve(workflowModulesPath, entry.name),
          "utf8",
        );

        return [moduleName, parseModuleExports(contents)];
      }),
  );
}

function parseModuleExports(contents: string): Set<string> {
  const exports = new Set<string>();

  for (const match of contents.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/gm,
  )) {
    exports.add(match[1]);
  }

  for (const match of contents.matchAll(/^export\s*{([^}]+)}/gm)) {
    addNamedExports(exports, match[1]);
  }

  return exports;
}

function parseBarrelReExports(contents: string): Set<string> {
  const exports = new Set<string>();

  for (const match of contents.matchAll(
    /export\s+(?:type\s+)?{([\s\S]*?)}\s+from\s+["'][^"']+["'];/g,
  )) {
    addNamedExports(exports, match[1]);
  }

  return exports;
}

function addNamedExports(exports: Set<string>, exportList: string): void {
  for (const part of exportList.split(",")) {
    const name = part.trim();

    if (name === "") {
      continue;
    }

    const exportedName = name
      .split(/\s+as\s+/)
      .at(-1)
      ?.trim();

    if (exportedName) {
      exports.add(exportedName);
    }
  }
}

describe("workflow barrel", () => {
  it("re-exports every intended public export from workflow domain modules", () => {
    const moduleExports = readWorkflowModules();
    const barrelExports = parseBarrelReExports(
      readFileSync(workflowBarrelPath, "utf8"),
    );
    const missingExports = [...moduleExports]
      .flatMap(([moduleName, exports]) =>
        [...exports]
          .filter(
            (name) =>
              !INTENTIONALLY_INTERNAL_EXPORTS.has(`${moduleName}:${name}`),
          )
          .filter((name) => !barrelExports.has(name))
          .map((name) => `${moduleName}:${name}`),
      )
      .sort();

    expect(
      missingExports,
      `apps/web/src/lib/data/workflow.ts is missing re-exports for: ${missingExports.join(", ")}`,
    ).toEqual([]);
  });

  it("does not re-export names that no workflow domain module exports", () => {
    const moduleExports = new Set(
      [...readWorkflowModules().values()].flatMap((exports) => [...exports]),
    );
    const barrelExports = parseBarrelReExports(
      readFileSync(workflowBarrelPath, "utf8"),
    );
    const deadReExports = [...barrelExports]
      .filter((name) => !moduleExports.has(name))
      .sort();

    expect(
      deadReExports,
      `apps/web/src/lib/data/workflow.ts re-exports names missing from workflow modules: ${deadReExports.join(", ")}`,
    ).toEqual([]);
  });
});
