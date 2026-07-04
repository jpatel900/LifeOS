import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * One-command production smoke runner (issue #241, B8).
 *
 * Targets a DEPLOYED (or local) app via SMOKE_BASE_URL using the dedicated
 * smoke Playwright config. This never starts its own web server: the target
 * is whatever SMOKE_BASE_URL points at, so prod semantics stay clean.
 *
 * Required env:
 *   SMOKE_BASE_URL                   base URL of the target app
 * Optional (unlock authenticated/persisted legs):
 *   SMOKE_EMAIL, SMOKE_PASSWORD      production sign-in credentials
 *   NEXT_PUBLIC_SUPABASE_URL         Supabase project URL (for cleanup)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY    Supabase anon key (for cleanup)
 * Opt-in external write (owner only, default OFF):
 *   SMOKE_GOOGLE_TEST_CALENDAR_ID    low-risk test calendar id
 *
 * Non-zero exit on any real failure; designed skips do not fail the run.
 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(scriptDir, "..");
const webDir = path.join(repoRoot, "apps", "web");

if (!process.env.SMOKE_BASE_URL || !process.env.SMOKE_BASE_URL.trim()) {
  console.error(
    "[smoke:prod] SMOKE_BASE_URL is required. Set it to the deployed base URL\n" +
      "(e.g. https://your-app.vercel.app) or a local dev server (http://127.0.0.1:3000),\n" +
      "then re-run: pnpm smoke:prod",
  );
  process.exit(2);
}

const playwrightCliPath = require.resolve("@playwright/test/cli", {
  paths: [webDir, repoRoot],
});

const child = spawn(
  process.execPath,
  [
    playwrightCliPath,
    "test",
    "--config",
    "playwright.smoke.config.ts",
    ...process.argv.slice(2),
  ],
  { cwd: webDir, stdio: "inherit", env: process.env },
);

child.on("error", (error) => {
  console.error(`[smoke:prod] Failed to launch Playwright: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
