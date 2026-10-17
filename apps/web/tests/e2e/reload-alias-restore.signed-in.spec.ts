import { expect, test, type Page, type Route } from "@playwright/test";
import { stubParseCaptureRoute } from "./helpers/mockParseCapture";
import { pinMomentPreference } from "./helpers/momentPreference";
import {
  SEEDED_USERS,
  SIGNED_IN_TAG,
  accountClient,
  expectOnlyKnownAccountFailures,
  gotoWithAccountSync,
  purgeOwnRows,
  reloadWithAccountSync,
  requireSupabaseEnv,
  signIn,
  watchAccountFailures,
  type AccountClient,
  type AccountFailureWatch,
  type SeededUser,
  type SupabaseEnv,
} from "./helpers/signedInAccount";

/**
 * #853 — an action taken right after a reload, BEFORE the first account sync
 * lands, must still reach the account row it is about.
 *
 * A reload empties the provider's per-mount local-id -> account-id maps. The
 * durable copy (`accountIdByLocalId`) rides `sessionStorage` back, and the
 * restore path must refill the maps from it (9331e3e: tasks, proposals,
 * blocks; 7b7df24: captures). Until the first post-reload sync swaps rows to
 * their account ids, every persist path depends on that refill.
 *
 * The unit guards (`PlanSheet.reloadAliasRestore.test.tsx`,
 * `TriageSheet.reloadAliasRestore.test.tsx`) prove the ids sent. This file
 * proves the same claims in a signed-in browser against a real stack, read
 * back out of Postgres with the browser's own JWT.
 *
 * ## How "before the first sync" is made deterministic
 *
 * plan-port-truth.spec.ts reloads and then waits for the sync, so it only hit
 * this window by luck (about 1 run in 10). Here the window is held open:
 * every `GET /rest/v1/capture_items` (one of the three row reads a sync
 * awaits before it swaps any id, `syncPersistedWorkflowRows`) is parked at
 * the network layer, from the action that creates the row until after the
 * post-reload tap. Writes pass through. The account is read back while the
 * reads are STILL parked, so the write cannot have been helped by a sync.
 * Only then are the reads released.
 *
 * Parking starts before the reload, not at it, because a sync that lands in
 * between (the one after a capture's account write, or after a placement)
 * swaps the row to its account id and takes the restore path out of play.
 *
 * Each test also checks its own precondition before the reload: the row is
 * still under its device-local id in the saved state, with its account twin
 * in the saved alias map. Without that, a sync that had already swapped the
 * id would make the test pass without exercising the restore path at all.
 */

let env: SupabaseEnv;

test.beforeAll(() => {
  env = requireSupabaseEnv();
});

const watches: AccountFailureWatch[] = [];

test.afterEach(() => {
  const seen = [...watches];
  watches.length = 0;
  expectOnlyKnownAccountFailures(seen);
});

/** Same shape as plan-port-truth.spec.ts: the watch is armed after sign-in. */
async function openSignedInToday(
  page: Page,
  user: SeededUser,
): Promise<AccountClient> {
  await stubParseCaptureRoute(page);
  await pinMomentPreference(page, "start");
  await signIn(page, user);
  watches.push(watchAccountFailures(page));

  const account = await accountClient(page, user, env);
  await purgeOwnRows(account);

  await gotoWithAccountSync(page, "/");
  await expect(page.getByTestId("today-moments")).toBeVisible({
    timeout: 30_000,
  });
  return account;
}

/** Capture `text` through the overlay. */
async function saveCapture(page: Page, text: string): Promise<void> {
  await page.getByTestId("capture-affordance").click();
  await page.getByTestId("capture-overlay-textarea").fill(text);
  await page.getByTestId("capture-overlay-save").click();
  await expect(page.getByTestId("capture-overlay")).toHaveCount(0, {
    timeout: 20_000,
  });
}

/** Sort the capture `text`, leaving its task draft open in triage. */
async function sortCapture(page: Page, text: string): Promise<void> {
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
}

/** Capture, sort and "Do today": a task ready to place (parse stub). */
async function seedDoTodayTask(page: Page, text: string): Promise<void> {
  await saveCapture(page, text);
  await sortCapture(page, text);
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

/**
 * The few fields of the saved workflow state this file reads. Read straight
 * out of `sessionStorage` (the copy a reload restores), never built here.
 */
interface StoredWorkflow {
  captureItems?: { id: string }[];
  calendarBlocks?: { id: string; status?: string }[];
  taskDrafts?: { id: string; status: string; capture_item_id?: string }[];
  accountIdByLocalId?: {
    captures?: Record<string, string>;
    blocks?: Record<string, string>;
  };
}

async function storedWorkflow(page: Page): Promise<StoredWorkflow> {
  return page.evaluate(
    () =>
      JSON.parse(
        window.sessionStorage.getItem("lifeos.phase2.workflow") ?? "{}",
      ) as StoredWorkflow,
  );
}

/**
 * Parks every `GET /rest/v1/capture_items` from now on, so no row sync can
 * land and swap an id. Writes pass straight through.
 *
 * `release` lets the parked reads continue. `abandon` only removes the hold:
 * it is for reads a reload has already cancelled, which have nowhere to go.
 */
interface HeldRowReads {
  heldCount: () => number;
  release: () => Promise<void>;
  abandon: () => Promise<void>;
}

async function holdCaptureRowReads(page: Page): Promise<HeldRowReads> {
  let held = 0;
  let releaseReads!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });
  const matcher = (url: URL) => url.pathname.endsWith("/rest/v1/capture_items");
  const handler = async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    held += 1;
    await released;
    await route.continue();
  };
  await page.route(matcher, handler);
  return {
    heldCount: () => held,
    release: async () => {
      releaseReads();
      await page.unroute(matcher, handler);
    },
    abandon: () => page.unroute(matcher, handler),
  };
}

/** Wait until a row read is actually parked: the sync is in flight. */
async function expectSyncParked(hold: HeldRowReads): Promise<void> {
  await expect
    .poll(hold.heldCount, {
      timeout: 30_000,
      message: "an account row read is parked",
    })
    .toBeGreaterThan(0);
}

/** Reload with the row sync parked, and wait until it is parked. */
async function reloadHoldingFirstSync(page: Page): Promise<HeldRowReads> {
  const hold = await holdCaptureRowReads(page);
  await page.reload();
  await expectSyncParked(hold);
  return hold;
}

interface BlockRow {
  id: string;
  status: string;
}
interface TaskRow {
  id: string;
  status: string;
  source_capture_item_id: string | null;
}
interface CaptureRow {
  id: string;
  status: string;
}

test.describe("#853 — acting after a reload, before the first sync", () => {
  test(`${SIGNED_IN_TAG} A: un-plan a placed block before the first sync -> the account block is cancelled`, async ({
    page,
  }) => {
    const account = await openSignedInToday(page, SEEDED_USERS.a);
    await seedDoTodayTask(page, "Reload alias: un-plan before the sync");

    await page.getByTestId("pipeline-overview-stage-plan").click();
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to put it here",
      { timeout: 20_000 },
    );
    // A row sync landing between the placement and the reload would swap
    // the block to its account id and take the restore path out of play.
    // Every row read is parked from the placement on, so the reload always
    // restores the block under its local id.
    const placementHold = await holdCaptureRowReads(page);
    await page.getByTestId("plan-sheet-hour-10").click();
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to take it off",
      { timeout: 20_000 },
    );
    await expect
      .poll(
        async () =>
          (
            await account.rows<BlockRow>("calendar_blocks?select=id,status")
          ).map((row) => row.status),
        { timeout: 30_000 },
      )
      .toEqual(["scheduled"]);
    const [accountBlock] = await account.rows<BlockRow>(
      "calendar_blocks?select=id,status",
    );

    // PRECONDITION: the saved state holds the block under its device-local
    // id, with the account block as its saved twin.
    let localBlockId = "";
    await expect
      .poll(
        async () => {
          const stored = await storedWorkflow(page);
          const aliases = stored.accountIdByLocalId?.blocks ?? {};
          localBlockId =
            Object.keys(aliases).find(
              (localId) => aliases[localId] === accountBlock.id,
            ) ?? "";
          return localBlockId;
        },
        {
          timeout: 15_000,
          message: "the saved alias map names the account block",
        },
      )
      .not.toBe("");
    expect(localBlockId).not.toBe(accountBlock.id);
    expect(
      ((await storedWorkflow(page)).calendarBlocks ?? []).map(
        (block) => block.id,
      ),
      "the saved state still holds the block under its local id",
    ).toContain(localBlockId);

    // THE RELOAD, with the first sync held open. Reads parked before it die
    // with the old document.
    await placementHold.abandon();
    const hold = await reloadHoldingFirstSync(page);
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to take it off",
      { timeout: 30_000 },
    );

    // THE UN-PLAN, inside the held window.
    await page.getByTestId("plan-sheet-hour-10").click();
    await expect(page.getByTestId("plan-sheet-hour-10")).not.toContainText(
      "Tap to take it off",
      { timeout: 20_000 },
    );

    // The account agrees while the sync is STILL held.
    await expect
      .poll(
        async () =>
          (
            await account.rows<BlockRow>("calendar_blocks?select=id,status")
          ).map((row) => `${row.id}:${row.status}`),
        { timeout: 30_000 },
      )
      .toEqual([`${accountBlock.id}:cancelled`]);
    await expect
      .poll(
        async () =>
          (await account.rows<TaskRow>("tasks?select=id,status")).map(
            (row) => row.status,
          ),
        { timeout: 30_000 },
      )
      .toEqual(["active"]);
    expect(hold.heldCount()).toBeGreaterThan(0);

    // Release the sync, then a fresh reload: the screen and account agree.
    await hold.release();
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("plan-sheet-hour-10")).toContainText(
      "Tap to put it here",
      { timeout: 30_000 },
    );
    expect(
      (await account.rows<BlockRow>("calendar_blocks?select=id,status")).map(
        (row) => row.status,
      ),
    ).toEqual(["cancelled"]);
  });

  test(`${SIGNED_IN_TAG} B: accept a sorted capture to backlog before the first sync -> the task is linked to its capture, which is not offered again`, async ({
    page,
  }) => {
    const text = "Reload alias: accept to backlog before the sync";
    const account = await openSignedInToday(page, SEEDED_USERS.a);

    // The capture's account write is followed by a row sync that swaps the
    // capture to its account id. A sort tapped before that sync lands leaves
    // a draft naming the LOCAL capture id, which is the state #853 is about.
    // Every row read is parked from the save on, so the sort lands in that
    // window on every run instead of by luck.
    const captureHold = await holdCaptureRowReads(page);
    await saveCapture(page, text);

    await expect
      .poll(
        async () =>
          (await account.rows<CaptureRow>("capture_items?select=id,status"))
            .length,
        { timeout: 30_000 },
      )
      .toBe(1);
    const [accountCapture] = await account.rows<CaptureRow>(
      "capture_items?select=id,status",
    );
    await sortCapture(page, text);

    // PRECONDITION: the pending draft points at a capture still under its
    // device-local id, with the account capture as its saved twin.
    let localCaptureId = "";
    await expect
      .poll(
        async () => {
          const stored = await storedWorkflow(page);
          const aliases = stored.accountIdByLocalId?.captures ?? {};
          localCaptureId =
            Object.keys(aliases).find(
              (localId) => aliases[localId] === accountCapture.id,
            ) ?? "";
          return localCaptureId;
        },
        {
          timeout: 15_000,
          message: "the saved alias map names the account capture",
        },
      )
      .not.toBe("");
    expect(localCaptureId).not.toBe(accountCapture.id);
    expect(
      ((await storedWorkflow(page)).captureItems ?? []).map(
        (capture) => capture.id,
      ),
      "the saved state still holds the capture under its local id",
    ).toContain(localCaptureId);
    expect(
      ((await storedWorkflow(page)).taskDrafts ?? [])
        .filter((draft) => draft.status === "pending")
        .map((draft) => draft.capture_item_id),
      "the saved pending draft names the local capture id",
    ).toEqual([localCaptureId]);
    expect(
      await account.rows<TaskRow>("tasks?select=id,status"),
      "no task exists before the accept",
    ).toEqual([]);

    // THE RELOAD, with the first sync held open. The reads parked before it
    // die with the old document. The triage sheet is in the URL, so it comes
    // back with the restored draft.
    await captureHold.abandon();
    const hold = await reloadHoldingFirstSync(page);
    await expect(page.getByTestId("triage-sheet-list")).toBeVisible({
      timeout: 30_000,
    });

    // THE ACCEPT, inside the held window.
    await page
      .getByTestId(/^triage-sheet-accept-/)
      .first()
      .click();
    await expect(page.getByTestId("triage-sheet-list")).toHaveCount(0, {
      timeout: 20_000,
    });

    // The account agrees while the sync is STILL held: one backlog task,
    // linked to the account capture, and that capture is resolved.
    await expect
      .poll(
        async () =>
          (
            await account.rows<TaskRow>(
              "tasks?select=id,status,source_capture_item_id",
            )
          ).map((row) => `${row.status}:${row.source_capture_item_id}`),
        { timeout: 30_000 },
      )
      .toEqual([`backlog:${accountCapture.id}`]);
    await expect
      .poll(
        async () =>
          (
            await account.rows<CaptureRow>("capture_items?select=id,status")
          ).map((row) => `${row.id}:${row.status}`),
        { timeout: 30_000 },
      )
      .toEqual([`${accountCapture.id}:resolved`]);
    expect(hold.heldCount()).toBeGreaterThan(0);

    // Release the sync, then a fresh reload: triage does not offer the
    // capture back.
    await hold.release();
    await reloadWithAccountSync(page);
    await expect(page.getByTestId("triage-sheet-empty")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("triage-sheet-captures")).toHaveCount(0);
  });
});
