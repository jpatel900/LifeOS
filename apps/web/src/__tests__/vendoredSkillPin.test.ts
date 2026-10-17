import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Vendored-skill pin guard (owner 2026-10-17).
 *
 * The maintainer's daily skill sync (`sync-skills-to-lifeos.ps1`, which lives
 * on the owner's machine, not in this repo) used to rewrite the whole
 * `impeccable` skill on every upstream change, ~28k lines of PR churn each
 * time. `.agents/skills/.vendored-manifest.json` now pins each vendored skill
 * to an upstream version plus a content hash of its directory. This test
 * fails when the committed directory no longer matches the pin, so a sync PR
 * that drifts the skill cannot merge unless it also bumps the pin on purpose
 * (new `version` + new `treeSha256` in the same reviewed PR).
 *
 * The hash covers every file under the skill dir: sorted repo-relative paths
 * plus content, with CRLF normalized to LF so a Windows checkout hashes the
 * same as Linux CI. On a deliberate bump, the failing assertion prints the
 * new hash ("Received") to copy into the manifest.
 */

const repoRoot = resolve(__dirname, "../../../..");
const skillsRoot = resolve(repoRoot, ".agents/skills");

type Pin = { version: string; treeSha256: string };
type Manifest = {
  skills: Record<string, { source: string; pin?: Pin }>;
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function skillTreeSha256(skillDir: string): string {
  const hash = createHash("sha256");
  const files = listFiles(skillDir)
    .map((file) => relative(skillDir, file).split("\\").join("/"))
    .sort();
  for (const rel of files) {
    const content = readFileSync(join(skillDir, rel), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    hash.update(`${rel}\0${content}\0`);
  }
  return hash.digest("hex");
}

const manifest = JSON.parse(
  readFileSync(resolve(skillsRoot, ".vendored-manifest.json"), "utf8"),
) as Manifest;

describe("vendored skill pins", () => {
  it("pins impeccable (the owner-kept vendored skill)", () => {
    expect(manifest.skills.impeccable?.pin?.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  for (const [name, entry] of Object.entries(manifest.skills)) {
    if (!entry.pin) continue;
    const pin = entry.pin;

    it(`${name}: committed tree matches its pinned hash`, () => {
      expect(
        skillTreeSha256(resolve(skillsRoot, name)),
        `${name} changed without a pin bump. Upstream updates are a deliberate bump: update ` +
          `"pin.version" and "pin.treeSha256" in .agents/skills/.vendored-manifest.json in the ` +
          `same reviewed PR, or revert the sync's rewrite of .agents/skills/${name}.`,
      ).toBe(pin.treeSha256);
    });

    it(`${name}: SKILL.md version matches the pinned version`, () => {
      const skillMd = readFileSync(
        resolve(skillsRoot, name, "SKILL.md"),
        "utf8",
      );
      const version = /^version:\s*(\S+)\s*$/m.exec(skillMd)?.[1];
      expect(version).toBe(pin.version);
    });
  }
});
