import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");
const globalsCss = readFileSync(
  resolve(repoRoot, "apps/web/src/app/globals.css"),
  "utf8",
);

// Raw millisecond durations already present in globals.css on main.
const GRANDFATHERED_DURATIONS_MS = [
  90, 160, 180, 200, 220, 240, 280, 1100, 1600,
];
// @keyframes already present on main.
const GRANDFATHERED_KEYFRAMES = [
  "workflow-rise-in",
  "workflow-soft-pulse",
  "workflow-sheen",
];

function distinctMatches(source: string, pattern: RegExp): string[] {
  return Array.from(
    new Set(Array.from(source.matchAll(pattern), ([match]) => match)),
  ).sort();
}

function walkFiles(relativePath: string): string[] {
  const currentPath = resolve(repoRoot, relativePath);

  return readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
    const nextRelativePath = `${relativePath}/${entry.name}`.replace(
      /\\/g,
      "/",
    );

    if (entry.isDirectory()) {
      return walkFiles(nextRelativePath);
    }

    if (!entry.isFile()) {
      return [];
    }

    return [nextRelativePath];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function reducedMotionBlock(source: string): string {
  const mediaRule = "@media (prefers-reduced-motion: reduce)";
  const mediaRuleStart = source.indexOf(mediaRule);
  expect(mediaRuleStart).toBeGreaterThanOrEqual(0);

  const blockStart = source.indexOf("{", mediaRuleStart);
  expect(blockStart).toBeGreaterThanOrEqual(0);

  let depth = 0;

  for (let index = blockStart; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(blockStart + 1, index);
      }
    }
  }

  throw new Error("Unclosed prefers-reduced-motion block in globals.css");
}

function componentSourceFiles(): string[] {
  return walkFiles("apps/web/src/app/components")
    .filter((file) => file.endsWith(".tsx"))
    .filter((file) => !/\.(?:test|spec)\.tsx$/.test(file));
}

describe("motion budget guard", () => {
  it("keeps raw globals.css durations on the grandfathered motion inventory", () => {
    const durations = distinctMatches(globalsCss, /\b\d+ms\b/g)
      .map((duration) => Number(duration.replace("ms", "")))
      .sort((a, b) => a - b);

    expect(durations).toEqual(
      [...GRANDFATHERED_DURATIONS_MS].sort((a, b) => a - b),
    );
  });

  it("requires new keyframes to be reduced-motion-safe", () => {
    const grandfatheredKeyframes = new Set(GRANDFATHERED_KEYFRAMES);
    const reducedMotionSource = reducedMotionBlock(globalsCss);
    const unguardedKeyframes = distinctMatches(
      globalsCss,
      /@keyframes\s+([_a-zA-Z][_a-zA-Z0-9-]*)/g,
    )
      .map((keyframesRule) => keyframesRule.replace(/@keyframes\s+/, ""))
      .filter((name) => !grandfatheredKeyframes.has(name))
      .filter((name) => !reducedMotionSource.includes(name));

    expect(unguardedKeyframes).toEqual([]);
  });

  it("keeps components token-only for motion durations", () => {
    const offenders = componentSourceFiles().flatMap((file) => {
      const source = stripComments(
        readFileSync(resolve(repoRoot, file), "utf8"),
      );
      const durations = distinctMatches(source, /\b\d+ms\b/g);

      return durations.map((duration) => `${file}: ${duration}`);
    });

    expect(offenders).toEqual([]);
  });

  it("keeps grandfathered motion allowlists shrink-only", () => {
    const staleDurations = GRANDFATHERED_DURATIONS_MS.filter(
      (duration) => !new RegExp(`\\b${duration}ms\\b`).test(globalsCss),
    );
    const staleKeyframes = GRANDFATHERED_KEYFRAMES.filter(
      (name) => !new RegExp(`@keyframes\\s+${name}\\b`).test(globalsCss),
    );

    expect(staleDurations).toEqual([]);
    expect(staleKeyframes).toEqual([]);
  });
});
