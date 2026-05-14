import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const repoMapPath = path.join(repoRoot, "docs", "agent", "REPO_MAP.json");

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function loadRepoMap() {
  let raw;

  try {
    raw = fs.readFileSync(repoMapPath, "utf8");
  } catch (error) {
    exitWithError(
      `Failed to read repo map: ${repoMapPath} (${error instanceof Error ? error.message : "unknown error"})`,
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    exitWithError(
      `Invalid repo map JSON: ${repoMapPath} (${error instanceof Error ? error.message : "unknown error"})`,
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.areas ||
    typeof parsed.areas !== "object"
  ) {
    exitWithError(`Invalid repo map structure: ${repoMapPath}`);
  }

  return parsed;
}

function printAvailableAreas(areaNames) {
  console.error(`Available areas: ${areaNames.join(", ")}`);
}

function printList(label, values) {
  console.log(`${label}:`);
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

const repoMap = loadRepoMap();
const areaNames = Object.keys(repoMap.areas).sort();
const areaName = process.argv[2];

if (!areaName) {
  exitWithError("Usage: pnpm agent:context <area>");
}

if (!Object.prototype.hasOwnProperty.call(repoMap.areas, areaName)) {
  console.error(`Unknown area: ${areaName}`);
  printAvailableAreas(areaNames);
  process.exit(1);
}

const area = repoMap.areas[areaName];
const requiredKeys = [
  "purpose",
  "readFirst",
  "likelyFiles",
  "risks",
  "quickChecks",
];

for (const key of requiredKeys) {
  if (!(key in area)) {
    exitWithError(
      `Invalid repo map entry for area "${areaName}": missing ${key}`,
    );
  }
}

console.log(`Area: ${areaName}`);
console.log(`Purpose: ${area.purpose}`);
printList("Read first", area.readFirst);
printList("Likely files", area.likelyFiles);
printList("Risks", area.risks);
console.log(
  "Quick checks: iteration only; final validation still follows AGENTS.md.",
);
for (const check of area.quickChecks) {
  console.log(`- ${check}`);
}
