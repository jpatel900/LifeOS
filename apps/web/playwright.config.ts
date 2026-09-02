import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Reproducibility lever, not a fix. `TodayMoments`' `heuristicMoment`
    // reads the BROWSER's local hour, so a spec that visits `/` without
    // pinning its moment renders a different surface on a UTC CI runner than
    // on a developer's machine in the Americas — which is how
    // session-truth.spec.ts and four of a11y-axe-pin.spec.ts's surfaces went
    // red on merged main while green on every branch and every local run.
    // Setting PLAYWRIGHT_TZ shifts only `getHours()` (epoch time, and so
    // every `startMs <= nowMs < endMs` block classification, is unaffected),
    // which makes that class of failure reproducible on demand:
    //   PLAYWRIGHT_TZ=Pacific/Auckland  -> a late-evening local hour
    //   PLAYWRIGHT_TZ=Asia/Dhaka        -> a midday local hour
    // Unset (the default, and CI) leaves the browser on the system zone.
    timezoneId: process.env.PLAYWRIGHT_TZ || undefined,
  },
  projects: [
    {
      name: "msedge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  ...(process.env.PLAYWRIGHT_DISABLE_WEBSERVER
    ? {}
    : {
        webServer: {
          command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 -p ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          // Moments pass P7b: the E2E lane runs the shipping go-live config —
          // `/` is the moments home. The demoted stage routes (/capture,
          // /triage, ...) stay live and their specs are unaffected. The code
          // default (lib/flags.ts) stays OFF so prod is not flipped by merging
          // this; the actual prod go-live is a separate env change (P7c).
          //
          // #687 demo-seed, independent verifier round 1: this
          // playwright.config.ts webServer block is ONLY used for a direct
          // `npx playwright test` run — CI (and `pnpm test:e2e`) go through
          // `scripts/run-playwright-e2e.mjs`, which spawns its OWN server and
          // sets `PLAYWRIGHT_DISABLE_WEBSERVER=1` so THIS block never runs.
          // The real fix for the CI failures (nav-truth.spec.ts,
          // capture-sort-triage.spec.ts, capture-status-truth.spec.ts — every
          // spec navigating `/` in unconfigured mode, only three of which
          // were ever re-targeted for the seed's existence) lives in that
          // script, not here. Kept in sync anyway so a direct local
          // `npx playwright test` run behaves the same as CI.
          env: {
            NEXT_PUBLIC_MOMENTS_HOME: "true",
            NEXT_PUBLIC_DEMO_SEED: "false",
          },
        },
      }),
});
