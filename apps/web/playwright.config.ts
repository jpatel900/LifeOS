import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
const baseURL = `http://127.0.0.1:${port}`;

// #687 demo-seed round 2 (independent verifier finding 4) — the seeded
// additive pin (`demo-seed-pin.seeded.spec.ts`) needs a REAL server booted
// with `NEXT_PUBLIC_DEMO_SEED=true`, not a hand-rolled sessionStorage
// snapshot bypassing the flag. Own port, right next to the main one (never
// 3100 — that belongs to whichever server the main project's `webServer`
// below, or `run-playwright-e2e.mjs` in CI, already owns).
const seededPort = Number(
  process.env.PLAYWRIGHT_SEEDED_PORT ?? String(port + 1),
);
const seededBaseURL = `http://127.0.0.1:${seededPort}`;
// #687 demo-seed round 3 (finding B) — filled in with the resolved default
// when not already set, so ANY spec file (regardless of which project runs
// it) can read both ports and navigate cross-origin to compare the main and
// seeded servers in one test — `demo-mode-banner-signin-link.spec.ts`'s
// height/wrap guard does exactly that.
process.env.PLAYWRIGHT_PORT = String(port);
process.env.PLAYWRIGHT_SEEDED_PORT = String(seededPort);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  // #687 demo-seed round 3 (MUST-FIX) — the seeded server's own file
  // protection for a direct `npx playwright test` run (CI's own protection
  // lives in `scripts/run-playwright-e2e.mjs`, which spawns the servers
  // itself before this config's `globalSetup` even runs — harmless overlap,
  // its own snapshot/restore is a no-op there since the outer script's
  // restore runs last with the TRUE pre-mutation snapshot). See
  // `tests/e2e/helpers/protectTrackedFiles.mjs`.
  globalSetup: "./tests/e2e/helpers/globalSetupProtectTrackedFiles.mjs",
  globalTeardown: "./tests/e2e/helpers/globalTeardownRestoreTrackedFiles.mjs",
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
      // #687 demo-seed round 2: the seeded spec runs in its own project
      // below, against its own server — excluded here so the main project
      // (server always SEED=false) never accidentally picks it up.
      testIgnore: /\.seeded\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
    {
      name: "msedge-seeded",
      testMatch: /\.seeded\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        channel: "msedge",
        baseURL: seededBaseURL,
      },
    },
  ],
  ...(process.env.PLAYWRIGHT_DISABLE_WEBSERVER
    ? {}
    : {
        // #687 demo-seed round 2: two servers, harmony-extended from the
        // one below rather than a second GitHub Actions workflow — this
        // `webServer` array form only ever matters for a direct
        // `npx playwright test` run (see the comment on the first entry);
        // CI's actual server spawn is `scripts/run-playwright-e2e.mjs`,
        // extended the same way (two `spawn` calls, two ports).
        webServer: [
          {
            command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 -p ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            // Moments pass P7b: the E2E lane runs the shipping go-live
            // config — `/` is the moments home. The demoted stage routes
            // (/capture, /triage, ...) stay live and their specs are
            // unaffected. The code default (lib/flags.ts) stays OFF so
            // prod is not flipped by merging this; the actual prod
            // go-live is a separate env change (P7c).
            //
            // #687 demo-seed, independent verifier round 1: this block is
            // ONLY used for a direct `npx playwright test` run — CI (and
            // `pnpm test:e2e`) go through `scripts/run-playwright-e2e.mjs`,
            // which spawns its OWN servers and sets
            // `PLAYWRIGHT_DISABLE_WEBSERVER=1` so this whole array never
            // runs there. Kept in sync anyway so a direct local run
            // behaves the same as CI.
            env: {
              NEXT_PUBLIC_MOMENTS_HOME: "true",
              NEXT_PUBLIC_DEMO_SEED: "false",
            },
          },
          {
            // The seed's own live server, used only by the
            // "msedge-seeded" project (`*.seeded.spec.ts`).
            command: `node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 -p ${seededPort}`,
            url: seededBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            env: {
              NEXT_PUBLIC_MOMENTS_HOME: "true",
              NEXT_PUBLIC_DEMO_SEED: "true",
              // Separate build cache from the main server above
              // (next.config.ts) — two `next dev` processes from the same
              // webDir must not share `.next/`.
              NEXT_DIST_DIR: ".next-seeded",
            },
          },
        ],
      }),
});
