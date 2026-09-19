import { expect, test, type Page } from "@playwright/test";
import { GOOGLE_CALENDAR_UNAVAILABLE_HERE } from "../../src/lib/statusVocabulary";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";

/**
 * #687 Target Card 2 (kept capabilities) — the Google approval gate, on the
 * SHIPPING Plan sheet.
 *
 * `cockpit-google-approval.spec.ts` proved this gate on the legacy cockpit,
 * but that whole file skips under the shipping config (it only runs with
 * `NEXT_PUBLIC_MOMENTS_HOME=false`), and `PlanSheet.test.tsx` only proves the
 * bridge is mounted. This file drives the same safety claim through the
 * moments home in a real browser, with no rollback flag:
 *
 *  - a block drafted on the Plan sheet shows an "Approve Google event" button
 *    that is DISABLED, with the real reason the bridge computes — this dev
 *    server has no Supabase env, so `createSupabaseBrowserClient()` returns
 *    null and the bridge says LifeOS isn't set up here;
 *  - no "Cancel Google event" control exists, before or after the local
 *    accept, because no LifeOS-owned Google event exists;
 *  - the browser makes no request to Google, to the Google Calendar routes,
 *    or to any host other than this local dev server;
 *  - the local path still works: "Put it on the rail" places the block.
 *
 * Nothing about the bridge is stubbed. The only route stub is the parse
 * mock every capture spec uses (HIGH-1, #670); off-host requests are aborted
 * AND recorded, so the "no external writes" assertion is about what the app
 * tried, not about what the network allowed.
 */

// Each viewport opens capture from the control it actually shows: the bottom
// navigator on mobile, the floating affordance on desktop.
const VIEWPORTS = [
  {
    name: "mobile 390",
    width: 390,
    height: 844,
    captureTestId: "bottom-navigator-capture",
  },
  {
    name: "desktop 1280",
    width: 1280,
    height: 800,
    captureTestId: "capture-affordance",
  },
] as const;

/**
 * Records every request that would leave the local dev server or touch the
 * Google Calendar routes, and aborts the off-host ones so nothing reaches a
 * provider even if the app misbehaved.
 */
async function watchExternalRequests(page: Page): Promise<string[]> {
  const seen: string[] = [];
  const localOrigin = new URL(test.info().project.use.baseURL!).origin;

  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    const { origin, pathname } = new URL(url);
    if (
      origin !== localOrigin ||
      pathname.startsWith("/api/google-calendar") ||
      /google/i.test(origin)
    ) {
      seen.push(`${request.method()} ${url}`);
    }
  });

  await page.context().route(
    (url) => url.origin !== localOrigin && url.protocol.startsWith("http"),
    (route) => route.abort("blockedbyclient"),
  );

  return seen;
}

/**
 * Capture -> sort -> "Do today": the shipped route to a do-today task, same
 * shape as `plan-port-truth.spec.ts`. The parse stub supplies a first move,
 * so the task arrives ready to draft.
 */
async function seedDoTodayTask(
  page: Page,
  captureTestId: string,
  text: string,
): Promise<void> {
  await page.getByTestId(captureTestId).click();
  await page.getByTestId("capture-overlay-textarea").fill(text);
  await page.getByTestId("capture-overlay-save").click();
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 20_000,
  });

  await page.getByTestId("pipeline-overview-stage-triage").click();
  await expect(page.getByTestId("triage-sheet-captures")).toContainText(text, {
    timeout: 20_000,
  });
  await page
    .getByTestId(/^triage-sheet-sort-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-list")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .getByTestId(/^triage-sheet-today-/)
    .first()
    .click();
  await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("moment-sheet-close").click();
  await expect(page.getByTestId("moment-sheet")).toHaveCount(0);
}

for (const viewport of VIEWPORTS) {
  test.describe(`Plan sheet Google approval — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("a drafted block's Google approval is disabled with the honest reason, and local accept still works", async ({
      page,
    }) => {
      const external = await watchExternalRequests(page);
      await stubParseCaptureRoute(page);
      await pinMomentPreference(page, "start");

      await page.goto("/");
      await expect(page.getByTestId("today-moments")).toBeVisible();

      const title = "Plan sheet Google approval item";
      await seedDoTodayTask(page, viewport.captureTestId, title);

      await page.getByTestId("pipeline-overview-stage-plan").click();
      const sheet = page.getByTestId("plan-sheet");
      await expect(sheet).toBeVisible({ timeout: 20_000 });

      // Draft a block through the sheet's own control.
      const drafts = sheet.getByTestId("plan-sheet-proposals").locator("> li");
      const draftsBefore = await drafts.count();
      const draftButton = sheet.getByTestId("plan-sheet-draft-block");
      await expect(draftButton).toBeEnabled();
      await draftButton.click();
      await expect(drafts).toHaveCount(draftsBefore + 1);
      await expect(drafts.last()).toContainText(title);

      // The gate: one approve button per drafted block, every one disabled,
      // with the reason the bridge actually computed — not the transient
      // "Checking" line.
      const bridge = sheet.getByTestId("google-approval-bridge");
      await bridge.scrollIntoViewIfNeeded();
      await expect(bridge).toBeVisible();
      await expect(
        bridge.getByText(GOOGLE_CALENDAR_UNAVAILABLE_HERE),
      ).toBeVisible();
      await expect(
        bridge.getByText("Checking Google Calendar availability."),
      ).toHaveCount(0);

      const approveButtons = bridge.getByRole("button", {
        name: `Approve Google event for ${title}`,
        exact: true,
      });
      await expect(approveButtons).toHaveCount(draftsBefore + 1);
      for (const button of await approveButtons.all()) {
        await expect(button).toBeVisible();
        await expect(button).toBeDisabled();
      }
      await expect(
        page.getByRole("button", { name: /Cancel Google event/ }),
      ).toHaveCount(0);

      // The local path keeps working: accepting the draft places the block,
      // with no Google event and so no cancel control.
      await sheet
        .getByTestId(/^plan-sheet-proposal-accept-/)
        .last()
        .click();
      await expect(
        sheet.getByTestId("plan-sheet-proposals-empty"),
      ).toBeVisible();
      await expect(
        sheet.getByTestId(/^plan-sheet-hour-\d+$/).filter({ hasText: title }),
      ).toHaveCount(1);
      await expect(approveButtons).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /Cancel Google event/ }),
      ).toHaveCount(0);

      expect(external, "no request may leave the local dev server").toEqual([]);
    });
  });
}
