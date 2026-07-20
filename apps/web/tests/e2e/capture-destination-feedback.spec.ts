import { expect, test } from "@playwright/test";

/**
 * #689 item 4 — browser proof of the capture destination contract.
 *
 * The owner's report: "When I capture a thought — I don't know where it is
 * going because I don't think I see it in the next flow pages." Two separate
 * failures produced that, and this spec pins both:
 *
 * 1. Nothing named the destination after a capture. The confirmation now says
 *    where the thought went and offers a one-tap path there.
 * 2. A raw (unparsed) capture was invisible in triage. Every capture persists
 *    as a capture item first, and only a parse turns it into a task draft —
 *    so a raw save lived ONLY in `captureItems`, while the triage sheet read
 *    `taskDrafts` and said "Nothing waiting in triage" even though the Start
 *    moment counted the thought as "waiting for a decision".
 *
 * Deliberately exercises the RAW path (no /api/parse-capture stub): it is the
 * path the owner actually hits in local mode, where the AI parse is
 * unavailable and the thought stays raw.
 */
test("a raw capture names its destination and is visible in triage", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  // The default moment is time-of-day derived; pin it to Start so the run is
  // deterministic regardless of the wall clock.
  await page.keyboard.press("1");
  await expect(page.getByTestId("start-moment")).toBeVisible();

  await page.getByTestId("capture-affordance").click();
  const dialog = page.getByRole("dialog", { name: "Capture a thought" });
  await expect(dialog).toBeVisible();

  const thought = "Buy milk and call the dentist";
  await page.getByTestId("capture-overlay-textarea").fill(thought);

  // "Save as-is, sort later" — the explicit raw path, no parse in flight.
  await page.getByTestId("capture-overlay-save-raw").click();

  // (1) The confirmation names WHERE the thought went, and offers the path.
  const toast = page.getByTestId("today-moments-toast");
  await expect(toast).toContainText("triage pile");
  const openTriage = page.getByTestId("today-moments-toast-undo");
  await expect(openTriage).toHaveText("Open triage");

  // (2) One tap lands on the thought itself — not on an empty sheet.
  await openTriage.click();
  const captures = page.getByTestId("triage-sheet-captures");
  await expect(captures).toBeVisible();
  // Scoped to the sheet: the thought also appears in the Start moment's
  // "waiting for a decision" card behind it, so an unscoped text lookup is
  // ambiguous. The claim under test is that it is visible HERE.
  await expect(captures.getByText(thought)).toBeVisible();
  // The regression this spec exists to catch: the sheet must not simultaneously
  // claim there is nothing waiting.
  await expect(page.getByTestId("triage-sheet-empty")).toHaveCount(0);
});
