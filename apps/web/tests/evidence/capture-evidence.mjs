/**
 * #688/#689 PR evidence capture (not part of the test suite).
 *
 * Drives the signed-out experience against a production build started with
 * Supabase CONFIGURED but no session — the owner's actual reported state —
 * and writes the PR screenshots.
 *
 * Usage: node tests/evidence/capture-evidence.mjs <baseUrl> <outDir>
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const baseUrl = process.argv[2] ?? "http://localhost:3212";
const outDir = process.argv[3] ?? ".github/pr-evidence/688-signedout";

const log = (...args) => console.log("[evidence]", ...args);

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function shot(name) {
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  log("captured", name);
}

// --- #688: the signed-out shell -------------------------------------------
await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await page.keyboard.press("1");
await page.getByTestId("start-moment").waitFor({ state: "visible" });
// The masthead sign-in door + the calm signed-out banner live on this screen.
await page.waitForTimeout(1500);
await shot("01-signedout-shell");

const signInPill = page.getByTestId("masthead-signin-link");
log("masthead sign-in door present:", await signInPill.count());
log("sign-in href:", await signInPill.getAttribute("href").catch(() => null));

// --- #688: health rows ----------------------------------------------------
await page.goto(`${baseUrl}/health`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot("02-health-signedout-rows");
log(
  "health signed-out links:",
  await page.locator('[data-testid^="health-signin-link-"]').count(),
);

// --- #689: capture -> confirmation -> triage ------------------------------
await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
await page.keyboard.press("1");
await page.getByTestId("start-moment").waitFor({ state: "visible" });
await page.getByTestId("capture-affordance").click();
await page.getByRole("dialog", { name: "Capture a thought" }).waitFor();
await page
  .getByTestId("capture-overlay-textarea")
  .fill("Buy milk and call the dentist");
await page.waitForTimeout(400);
await shot("03-capture-overlay");

await page.getByTestId("capture-overlay-save-raw").click();
await page.getByTestId("today-moments-toast").waitFor({ state: "visible" });
await page.waitForTimeout(600);
await shot("04-capture-confirmation");
log("toast text:", await page.getByTestId("today-moments-toast").innerText());

await page.getByTestId("today-moments-toast-undo").click();
await page.getByTestId("triage-sheet-captures").waitFor({ state: "visible" });
await page.waitForTimeout(600);
await shot("05-triage-shows-capture");
log(
  "triage empty-state present (must be 0):",
  await page.getByTestId("triage-sheet-empty").count(),
);
log(
  "signed-out note present:",
  await page.getByTestId("triage-sheet-signedout-note").count(),
);

// --- #688: the login door itself ------------------------------------------
await page.goto(`${baseUrl}/login?next=%2Fhealth`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(800);
await shot("06-login-page");

await browser.close();
log("done");
