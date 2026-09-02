import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * #687 demo-seed round 3 (MUST-FIX) — shared logic behind
 * `globalSetupProtectTrackedFiles.mjs` / `globalTeardownRestoreTrackedFiles.mjs`,
 * playwright.config.ts's `globalSetup`/`globalTeardown` for a DIRECT
 * `npx playwright test` run (`scripts/run-playwright-e2e.mjs`, the CI path,
 * has its own copy of this same idea inline). A `next dev` process started
 * with `NEXT_DIST_DIR=.next-seeded` (the seeded server, this config's own
 * second `webServer` entry) rewrites two TRACKED files on startup:
 * `next-env.d.ts`'s dist-dir reference, and `tsconfig.json`'s `include`
 * array (plus Next's own JSON re-formatting). Snapshot before either server
 * starts, restore after both are torn down, so a local run never leaves the
 * tree dirty.
 */
const webDir = path.resolve(fileURLToPath(import.meta.url), "../../../..");
export const protectedFiles = [
  path.join(webDir, "next-env.d.ts"),
  path.join(webDir, "tsconfig.json"),
];
const snapshotPath = path.join(webDir, ".protected-files-snapshot.json");

export function snapshotProtectedFiles() {
  const snapshot = Object.fromEntries(
    protectedFiles.map((file) => [file, fs.readFileSync(file, "utf8")]),
  );
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
}

export function restoreProtectedFiles() {
  if (!fs.existsSync(snapshotPath)) return;
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  for (const [file, original] of Object.entries(snapshot)) {
    try {
      if (fs.readFileSync(file, "utf8") !== original) {
        fs.writeFileSync(file, original);
      }
    } catch (error) {
      console.error(`[playwright] failed to restore ${file}:`, error);
    }
  }
  fs.rmSync(snapshotPath, { force: true });
}
