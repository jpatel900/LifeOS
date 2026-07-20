import { expect, test, type Page, type Route } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";

// HIGH-1 (#670): /api/parse-capture requires a verified bearer token and the
// E2E dev server has no Supabase env, so every capture flow in this file runs
// against the deterministic mock-parser stub (task-map lifecycle precedent).
test.beforeEach(async ({ page }) => {
  await stubParseCaptureRoute(page);
});

/**
 * FR-031 task-map lifecycle — end-to-end oracle (INV-10).
 *
 * Unit/component tests already cover the graph engine (`lib/taskmap/*`) and
 * the individual components (`TaskMapSection`/`TaskMapView`/
 * `TaskMapDraftReview`) in isolation, plus one-off manual visual gates. This
 * spec is the one permanent guard that drives the whole owner-facing loop
 * through a real browser: draft -> review -> approve -> collapse -> complete
 * -> undo -> revise -> carry-forward, plus the degrade path. It stubs
 * `POST /api/task-map` with a deterministic graph (real AI providers are
 * untested here by design — that is `taskMapDraftService`/provider-level
 * territory) and drives the rest of the stack for real.
 *
 * Demo drive (mirrors moments-home-parity.spec.ts / cockpit-flow-repair):
 * capture -> parse -> "Do today" -> `/` -> Flow moment (key "2"). The
 * captured task becomes `startVM.firstMove`, which is the same id the Flow
 * moment's TaskMapSection focuses (`TodayMoments.tsx` railTaskId).
 */

const DRAFT_GRAPH = {
  schema_version: "1.0" as const,
  nodes: [
    {
      id: "outline",
      title: "Draft outline",
      role: "required" as const,
      // FR-023 slice F4 (#678): the flagged sub-60s opening move (an entry
      // node), so the approve-time identity write sets first_tiny_step.
      two_minute_move: true as const,
    },
    {
      id: "draft-body",
      title: "Write draft body",
      role: "required" as const,
    },
    {
      id: "send-review",
      title: "Send for review",
      role: "required" as const,
    },
    { id: "diagrams", title: "Add diagrams", role: "optional" as const },
    {
      id: "skip-legal",
      title: "Skip legal review",
      role: "red" as const,
      red_reason: "Needs compliance sign-off first",
    },
  ],
  edges: [
    { from: "outline", to: "draft-body" },
    { from: "draft-body", to: "send-review" },
  ],
};

// Revision draft (FR-031 slice 8): "outline" survives by id so carry-forward
// applies; "draft-body" is dropped and a new required node "polish" is
// inserted before the (renamed) review step. "diagrams" and "skip-legal" are
// dropped so the revised collapsed view has no hidden fold.
const REVISED_GRAPH = {
  schema_version: "1.0" as const,
  nodes: [
    { id: "outline", title: "Draft outline", role: "required" as const },
    { id: "polish", title: "Polish the draft", role: "required" as const },
    {
      id: "send-review",
      title: "Send for final review",
      role: "required" as const,
    },
  ],
  edges: [
    { from: "outline", to: "polish" },
    { from: "polish", to: "send-review" },
  ],
};

// FR-031 slice F5 (#679): revision candidate served after an offer tap.
// "outline" is byte-identical (incl. the two_minute_move flag) so the diff
// dims it; "polish" is new; "send-review" keeps its id but is retitled
// (changed + completion carry-forward); "draft-body"/"diagrams"/"skip-legal"
// are dropped.
const REVISED_F5_GRAPH = {
  schema_version: "1.0" as const,
  nodes: [
    {
      id: "outline",
      title: "Draft outline",
      role: "required" as const,
      two_minute_move: true as const,
    },
    { id: "polish", title: "Polish the draft", role: "required" as const },
    {
      id: "send-review",
      title: "Send for final review",
      role: "required" as const,
    },
  ],
  edges: [
    { from: "outline", to: "polish" },
    { from: "polish", to: "send-review" },
  ],
};

const REVISION_OFFER_STORE_KEY = "lifeos.taskMapRevisionOffers.v1";
const PURPOSE_GAUGE_KEY = "lifeos.moments.purposeGaugeLastChecked";

/**
 * ONE-OFFER-PER-CLOSE precedence (#692): on an FR-033 sample day (the 4th,
 * 12th, 20th, 28th) the purpose-gauge check-in legitimately WINS the single
 * Close offer slot and the map-revision offer is suppressed. That is correct
 * product behavior — but it would make this spec pass 27 days a month and
 * fail 4. Marking the check-in as already taken TODAY (the product's own
 * per-day suppression, no test-only hook) makes the Close slot
 * deterministically available on every calendar day. The precedence rule
 * itself is covered by unit tests in CloseMoment.test.tsx.
 */
async function neutralizePurposeGaugeOffer(page: Page) {
  await page.addInitScript((key) => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
    window.localStorage.setItem(key, stamp);
  }, PURPOSE_GAUGE_KEY);
}

/** Approves the stubbed draft as-is and completes "send-review" FIRST -
 * an out-of-critical-path-order completion, the deterministic kernel's
 * strongest evidence signal - which surfaces the revision offer card. */
async function approveMapAndCompleteOutOfOrder(page: Page) {
  await page.getByTestId("taskmap-draft-cta").click();
  await expect(page.getByTestId("taskmap-draft-review")).toBeVisible();
  await page.getByTestId("taskmap-draft-approve").click();
  await expect(page.getByTestId("taskmap-view")).toBeVisible();

  const lastChip = page.getByTestId("taskmap-node-send-review");
  await lastChip.click();
  await expect(lastChip).toHaveAttribute("data-done", "true");
}

async function captureAndEnterFlow(page: Page, title: string) {
  await page.goto("/capture");
  await page.getByPlaceholder("Drop the thought here.").fill(title);

  const parseResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/parse-capture") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save thought" }).click();
  await parseResponsePromise;

  await page.getByRole("button", { name: "Do today" }).click();

  await page.goto("/");
  await expect(page.getByTestId("today-moments")).toBeVisible();
  await page.keyboard.press("2");
  await expect(page.getByTestId("flow-moment")).toBeVisible();
}

/** Stubs POST /api/task-map with an `ok:true` draft response. `graph()` is
 * called lazily on every request so the caller can swap the returned graph
 * mid-test (the revise step) without re-registering the route. */
async function stubDraftEndpoint(
  page: Page,
  graph: () => Record<string, unknown>,
) {
  await page.route("**/api/task-map", async (route: Route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        parser: "mock",
        draft: graph(),
        suggestionRecordId: null,
        status: "mock",
      }),
    });
  });
}

test.describe("task-map lifecycle (FR-031)", () => {
  test("draft, approve, complete/undo, revise with carry-forward", async ({
    page,
  }) => {
    let currentGraph: Record<string, unknown> = DRAFT_GRAPH;
    await stubDraftEndpoint(page, () => currentGraph);

    await captureAndEnterFlow(page, "Task map lifecycle proof item");

    // 1. Draft affordance on the focused task's rail, and the draft review
    // it opens.
    await expect(page.getByTestId("taskmap-rail-fallback")).toBeVisible();
    const draftCta = page.getByTestId("taskmap-draft-cta");
    await expect(draftCta).toHaveText("Draft map");
    await draftCta.click();

    const review = page.getByTestId("taskmap-draft-review");
    await expect(review).toBeVisible();

    // Red node renders read-only with its reason, never as a clickable
    // control.
    const redChip = page.getByTestId("taskmap-node-skip-legal");
    await expect(redChip).toBeVisible();
    await expect(redChip).toContainText("Needs compliance sign-off first");
    await expect(redChip).toHaveAttribute("aria-disabled", "true");
    expect(await redChip.evaluate((el) => el.tagName)).toBe("DIV");
    // No editable title input is rendered for a red node — it is never
    // clickable/editable, only removable like any other draft node.
    await expect(page.getByTestId("taskmap-draft-edit-skip-legal")).toHaveCount(
      0,
    );

    // 2. Remove one (non-red) node, then approve.
    await page.getByTestId("taskmap-draft-remove-diagrams").click();
    await expect(page.getByTestId("taskmap-draft-edit-diagrams")).toHaveCount(
      0,
    );

    const approveButton = page.getByTestId("taskmap-draft-approve");
    await expect(approveButton).toHaveText("Right enough to start");
    await approveButton.click();

    // Collapsed map shows the code-computed critical path only, with the
    // removed optional node gone and the red node folded behind "+N more".
    const mapView = page.getByTestId("taskmap-view");
    await expect(mapView).toBeVisible();
    await expect(page.getByTestId("taskmap-node-outline")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-draft-body")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-send-review")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-diagrams")).toHaveCount(0);

    // FR-023 slice F4 (#678): first node IS first_tiny_step. The flagged
    // entry node "outline" carries the "start here" affordance in the
    // collapsed map, AND its title is written to the task's first_tiny_step.
    await expect(
      page.getByTestId("taskmap-first-step-badge-outline"),
    ).toBeVisible();

    // Same-string assertion (criterion 3): the FirstTinyStepCard renders only
    // during an active focus session (FlowMoment gates it on
    // `hasActiveSession`), so take the first move from Start — the natural
    // FR-023 order: the approve above populated the field, so starting is
    // un-gated, and the card must surface the SAME string as the map's first
    // node. One fact, two places.
    await page.keyboard.press("1");
    await expect(page.getByTestId("start-moment")).toBeVisible();
    await page.getByTestId("first-move-start").click();
    await expect(page.getByTestId("flow-moment")).toBeVisible();
    await expect(page.getByTestId("first-tiny-step-value")).toHaveText(
      "Draft outline",
    );

    // Slice A (#664): the map is DRAWN — dependency edges render as SVG
    // connectors and the code-computed critical path is highlighted.
    const spineEdge1 = page.getByTestId("taskmap-edge-outline-draft-body");
    const spineEdge2 = page.getByTestId("taskmap-edge-draft-body-send-review");
    await expect(spineEdge1).toHaveAttribute("data-critical", "true");
    await expect(spineEdge2).toHaveAttribute("data-critical", "true");

    const expandCta = page.getByTestId("taskmap-expand");
    await expect(expandCta).toHaveText("+1 more (optional / other paths)");

    // Expanded: the FULL graph is drawn (red node kept in its DAG position)
    // with the critical path still highlighted within it.
    await expandCta.click();
    await expect(page.getByTestId("taskmap-full-graph")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-skip-legal")).toBeVisible();
    await expect(
      page.getByTestId("taskmap-edge-outline-draft-body"),
    ).toHaveAttribute("data-critical", "true");
    await page.getByTestId("taskmap-collapse").click();
    await expect(page.getByTestId("taskmap-node-skip-legal")).toHaveCount(0);

    // 3. Complete a critical node -> next-node emphasis advances; undo
    // restores it.
    const outlineChip = page.getByTestId("taskmap-node-outline");
    const draftBodyChip = page.getByTestId("taskmap-node-draft-body");

    await expect(outlineChip).toHaveClass(/ring-2/);
    await expect(draftBodyChip).not.toHaveClass(/ring-2/);

    await outlineChip.click();
    await expect(outlineChip).toHaveAttribute("data-done", "true");
    await expect(outlineChip).toHaveAttribute("aria-pressed", "true");
    await expect(draftBodyChip).toHaveClass(/ring-2/);
    await expect(outlineChip).not.toHaveClass(/ring-2/);

    await outlineChip.click();
    await expect(outlineChip).toHaveAttribute("data-done", "false");
    await expect(outlineChip).toHaveAttribute("aria-pressed", "false");
    await expect(outlineChip).toHaveClass(/ring-2/);

    // Re-complete "outline" so the carry-forward assertion below has a
    // concrete completed node to check.
    await outlineChip.click();
    await expect(outlineChip).toHaveAttribute("data-done", "true");

    // 4. Revise map -> the stub now serves the revised graph.
    currentGraph = REVISED_GRAPH;
    const reviseCta = page.getByTestId("taskmap-revise-cta");
    await expect(reviseCta).toHaveText("Revise map");
    await reviseCta.click();

    const revisedReview = page.getByTestId("taskmap-draft-review");
    await expect(revisedReview).toBeVisible();
    const replaceButton = page.getByTestId("taskmap-draft-approve");
    await expect(replaceButton).toHaveText("Replace the map");
    await replaceButton.click();

    // Surviving completed node ("outline") keeps its done state; the new
    // node ("polish") is present; the dropped node ("draft-body") is gone.
    await expect(page.getByTestId("taskmap-view")).toBeVisible();
    const revisedOutlineChip = page.getByTestId("taskmap-node-outline");
    await expect(revisedOutlineChip).toHaveAttribute("data-done", "true");
    await expect(page.getByTestId("taskmap-node-polish")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-draft-body")).toHaveCount(0);
  });

  test("a degraded draft response shows a calm notice and keeps the v0 rail", async ({
    page,
  }) => {
    await page.route("**/api/task-map", async (route: Route) => {
      if (route.request().method() !== "POST") {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          degrade: "breakdown_rail",
          errors: ["x"],
        }),
      });
    });

    await captureAndEnterFlow(page, "Task map degrade proof item");

    const rail = page.getByTestId("taskmap-rail-fallback");
    await expect(rail).toBeVisible();
    await page.getByTestId("taskmap-draft-cta").click();

    const notice = page.getByTestId("taskmap-draft-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(
      "Couldn't draft a map right now. Staying on the step list.",
    );
    // The notice is its own line (a <p>), not appended into the button text.
    expect(await notice.evaluate((el) => el.tagName)).toBe("P");
    await expect(page.getByTestId("taskmap-draft-cta")).toHaveText("Draft map");

    // The v0 rail stays intact — no dead end (NFR-004).
    await expect(rail).toBeVisible();
    await expect(page.getByTestId("taskmap-view")).toHaveCount(0);
  });
  test("F5: an out-of-order completion offers a revision; reject leaves the approved map untouched; the tapped offer opens a code-computed diff and approve carries completion forward", async ({
    page,
  }) => {
    let currentGraph: Record<string, unknown> = DRAFT_GRAPH;
    await stubDraftEndpoint(page, () => currentGraph);
    await captureAndEnterFlow(page, "Task map F5 revision proof item");
    await approveMapAndCompleteOutOfOrder(page);

    // The one-line offer card appears AFTER the completion write - and only
    // then; it is render-only (no AI call was made: the stub would have
    // flipped the review open, and it did not).
    const offer = page.getByTestId("taskmap-revision-offer");
    await expect(offer).toBeVisible();
    await expect(
      page.getByTestId("taskmap-revision-offer-reason"),
    ).toContainText("before an earlier step in the plan");
    await expect(page.getByTestId("taskmap-draft-review")).toHaveCount(0);

    // "Not now" dismisses: the offer disappears and the approved map is
    // byte-untouched (same nodes, same completion state).
    await page.getByTestId("taskmap-revision-offer-dismiss").click();
    await expect(offer).toHaveCount(0);
    await expect(page.getByTestId("taskmap-node-send-review")).toHaveAttribute(
      "data-done",
      "true",
    );
    await expect(page.getByTestId("taskmap-node-draft-body")).toBeVisible();

    // Dismissal suppresses re-offers for this evidence, and one offer per
    // task per day is the cap - reset the device-local offer record (test
    // shortcut standing in for "a new day / new evidence") to exercise the
    // tap path on the same task.
    await page.evaluate(
      (key) => localStorage.removeItem(key),
      REVISION_OFFER_STORE_KEY,
    );
    const lastChip = page.getByTestId("taskmap-node-send-review");
    await lastChip.click(); // undo - never a trigger
    await expect(lastChip).toHaveAttribute("data-done", "false");
    await expect(offer).toHaveCount(0);
    await lastChip.click(); // re-complete - the trigger
    await expect(offer).toBeVisible();

    // Tap the offer: the stub serves the revision candidate and the review
    // opens in DIFF MODE - unchanged dimmed, new/changed badged, dropped
    // steps listed. The diff is computed in code from the two graphs.
    currentGraph = REVISED_F5_GRAPH;
    await page.getByTestId("taskmap-revision-offer-propose").click();
    await expect(page.getByTestId("taskmap-draft-review")).toBeVisible();

    const unchangedRow = page
      .getByTestId("taskmap-draft-edit-outline")
      .locator("xpath=ancestor::*[@data-diff]");
    await expect(unchangedRow).toHaveAttribute("data-diff", "unchanged");
    await expect(page.getByTestId("taskmap-diff-badge-polish")).toHaveText(
      "New step",
    );
    await expect(page.getByTestId("taskmap-diff-badge-send-review")).toHaveText(
      "Changed",
    );
    await expect(page.getByTestId("taskmap-diff-removed")).toContainText(
      "Add diagrams",
    );

    // Approve = the existing one-pass approve path: surviving completed id
    // ("send-review") keeps its done state, the dropped node is gone, and
    // the FR-023 first-step identity stays synced to the flagged node.
    await page.getByTestId("taskmap-draft-approve").click();
    await expect(page.getByTestId("taskmap-view")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-send-review")).toHaveAttribute(
      "data-done",
      "true",
    );
    await expect(page.getByTestId("taskmap-node-polish")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-draft-body")).toHaveCount(0);
    await expect(
      page.getByTestId("taskmap-first-step-badge-outline"),
    ).toBeVisible();
  });

  test("F5: Close surfaces at most one named offer for the most-active map; Keep current map rejects without touching it", async ({
    page,
  }) => {
    let currentGraph: Record<string, unknown> = DRAFT_GRAPH;
    await stubDraftEndpoint(page, () => currentGraph);
    // Must run before the first navigation (see the helper's doc comment).
    await neutralizePurposeGaugeOffer(page);
    await captureAndEnterFlow(page, "Task map F5 close offer proof item");
    await approveMapAndCompleteOutOfOrder(page);

    // Ignore the Flow offer; Close computes its own single offer. Reset the
    // shown-today record (the daily cap would otherwise absorb the Flow
    // offer) so the Close trigger is exercised in isolation.
    await page.getByTestId("taskmap-revision-offer-dismiss").click();
    await page.evaluate(
      (key) => localStorage.removeItem(key),
      REVISION_OFFER_STORE_KEY,
    );

    await page.keyboard.press("3");
    await expect(page.getByTestId("close-moment")).toBeVisible();

    // Exactly one offer, naming the most-active map's task.
    const closeOffer = page.getByTestId("taskmap-revision-offer");
    await expect(closeOffer).toHaveCount(1);
    await expect(closeOffer).toContainText(
      "Task map F5 close offer proof item",
    );

    // Tap -> diff review at Close; "Keep current map" rejects.
    currentGraph = REVISED_F5_GRAPH;
    await page.getByTestId("taskmap-revision-offer-propose").click();
    await expect(page.getByTestId("taskmap-draft-review")).toBeVisible();
    await page.getByTestId("taskmap-draft-dismiss").click();
    await expect(page.getByTestId("taskmap-draft-review")).toHaveCount(0);

    // Back in Flow the approved map is exactly as it was: the dropped
    // candidate never applied, completion state intact (NS-INV-4 - a
    // rejected proposal changes nothing).
    await page.keyboard.press("2");
    await expect(page.getByTestId("taskmap-view")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-send-review")).toHaveAttribute(
      "data-done",
      "true",
    );
    await expect(page.getByTestId("taskmap-node-draft-body")).toBeVisible();
    await expect(page.getByTestId("taskmap-node-polish")).toHaveCount(0);
  });
});
