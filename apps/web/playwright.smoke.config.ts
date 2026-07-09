import { defineConfig, devices } from "@playwright/test";

/**
 * Production smoke config (issue #241, B8).
 *
 * This config is deliberately separate from `playwright.config.ts` so the
 * production smoke never mixes with CI e2e:
 *
 * - It targets a DEPLOYED app via `SMOKE_BASE_URL` (no local `webServer`).
 *   For a local proof, start `pnpm dev` yourself and point `SMOKE_BASE_URL`
 *   at it (e.g. http://127.0.0.1:3000).
 * - Specs live under `tests/smoke`, outside vitest's `src/**` include glob,
 *   so `pnpm test` never sweeps them up.
 * - It uses the `msedge` channel (present on the target dev box) to avoid a
 *   possibly-unavailable Chromium download.
 *
 * Safety posture is enforced in the specs, not here: the default run asserts
 * up to the approval gate and performs no real external calendar write.
 *
 * Artifacts (trace/screenshot) are OFF by default and opt-in only, because a
 * failure trace can capture real personal task content, and this repo's CI
 * artifacts are publicly downloadable (public repo). Set
 * `SMOKE_CAPTURE_ARTIFACTS=1` to retain them on failure when debugging — see
 * docs/VERCEL_PRODUCTION_CHECKLIST.md.
 */
const baseURL = process.env.SMOKE_BASE_URL?.trim();

if (!baseURL) {
  throw new Error(
    "SMOKE_BASE_URL is required for the production smoke. Set it to the deployed base URL " +
      "(e.g. https://your-app.vercel.app) or a local dev server (http://127.0.0.1:3000).",
  );
}

const captureArtifacts = process.env.SMOKE_CAPTURE_ARTIFACTS === "1";

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // Prod round-trips are slower than local e2e; give each journey room.
  timeout: 120_000,
  use: {
    baseURL,
    trace: captureArtifacts ? "retain-on-failure" : "off",
    screenshot: captureArtifacts ? "only-on-failure" : "off",
    // Never treat prod TLS/self-signed quirks as a test crash.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "msedge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
});
