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
          env: { NEXT_PUBLIC_MOMENTS_HOME: "true" },
        },
      }),
});
