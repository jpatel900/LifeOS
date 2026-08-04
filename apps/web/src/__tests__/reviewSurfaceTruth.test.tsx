import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LifeOSCockpit, ReviewView } from "../app/components/LifeOSCockpit";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import type { WorkflowState } from "@/lib/workflow";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  buildWorkflowCockpitViewModel,
  captureWorkflow,
  planLatestActiveTask,
  workflowSeed,
} from "./helpers/workflowReachability";

/**
 * Final UX Loop C2-S3 — FINDINGS 5 and 6 from the C2-S1 capability inventory
 * (issue #687, comment "C2-S1 capability inventory — port premises").
 *
 * Both are pinned HERE, on the legacy `/review` screen, deliberately: the
 * ported moments surface is correct from birth and so produces no red, and
 * `/review` stays live until S6. A finding fixed only on the new surface would
 * leave the shipped one lying for the length of the campaign.
 *
 * ## FINDING 5 — the headline counted a workload three different ways
 *
 * `ReviewView` computed `total = done + planned + today + reviewQueue` and
 * showed `total - done` as "N carry over". But `reviewQueue` ALREADY contains
 * every `today` (active) task and every `backlog` task — `viewModel.ts`
 * literally spreads `...today.map(...)` and `...backlog.map(...)` into it — so
 * every active task was counted twice and every planned block was counted as
 * carry-over work.
 *
 * Measured by the inventory on the seed reproduced below: headline **6**,
 * stage chip **3**, cards actually listed **3**.
 *
 * ## The label half, which arithmetic alone does not fix
 *
 * Making the number `reviewQueue.length` makes it agree with the list, and the
 * words "carry over" are still wrong at that number: a `scheduled` task is
 * open work and is deliberately NOT in `reviewQueue` (not active, not backlog,
 * not blocked, no missed block, no failed session). So the count agrees with
 * its list while the words claim a coverage the list does not have. #804's
 * rule for this campaign is that a count says what its label says, so the
 * headline is renamed to the list it heads.
 *
 * ## FINDING 6 — one card's button emptied the whole screen
 *
 * `LifeOSCockpit` wired `onCarryForward` to `carryForwardTask(taskId)` AND
 * `navigate("plan")`. Pressing it on the first recovery card left `/review`,
 * so the remaining cards, Defer, Drop and Save review all became unreachable
 * and the day could not be closed without navigating back. Defer and Drop —
 * the two buttons sitting beside it in the same card — did not do this.
 */

// The cockpit's `navigate()` is `router.push(STAGE_PATHS[stage])`, so the spy
// on `push` IS the FINDING 6 assertion. Hoisted because `vi.mock` factories run
// before the module graph is imported.
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/review",
  useRouter: () => ({ push: routerPush }),
}));

const STORAGE_KEY = "lifeos.phase2.workflow";

/**
 * The inventory's measured seed: 2 active + 1 backlog + 1 scheduled task, all
 * in one area. Distinct open items: 4. Recovery cards: 3 (the scheduled task
 * is not in the queue). Legacy headline on 873c6ed7: 6.
 */
function inventorySeedState(): WorkflowState {
  let state = workflowSeed();
  state = captureWorkflow(state, "First open thing.");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Second open thing.");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Third open thing.");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Something put off for later.");
  state = backlogLatestDraft(state);
  // One of the three actives gets an hour, so it leaves `active` for
  // `scheduled` and stops being a recovery card while staying open work.
  state = planLatestActiveTask(state, 9);
  return state;
}

function seedStorage(state: WorkflowState): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

describe("legacy /review tells the truth (C2-S3 port premises)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/review");
    routerPush.mockClear();
  });

  it("FINDING 5 — the headline number equals the number of cards under it", () => {
    const state = inventorySeedState();
    const vm = buildWorkflowCockpitViewModel(state);

    // Preconditions, asserted so a seed drift cannot quietly pass this test.
    expect(state.tasks.filter((task) => task.status === "active")).toHaveLength(
      2,
    );
    expect(
      state.tasks.filter((task) => task.status === "backlog"),
    ).toHaveLength(1);
    expect(
      state.tasks.filter((task) => task.status === "scheduled"),
    ).toHaveLength(1);

    render(
      <ReviewView
        vm={vm}
        policyProposals={[]}
        onDecidePolicy={() => {}}
        onCarryForward={() => {}}
        onDefer={() => {}}
        onDrop={() => {}}
        onSave={() => {}}
      />,
    );

    const headline = screen.getByTestId("review-headline").textContent ?? "";
    const headlineCount = Number(headline.match(/\d+/)?.[0] ?? NaN);
    const cards = screen.getAllByRole("button", { name: "Carry forward" });

    expect(cards).toHaveLength(3);
    expect(headlineCount).toBe(cards.length);
  });

  it("FINDING 5 — the headline names the list it heads, not all open work", () => {
    const state = inventorySeedState();
    render(
      <ReviewView
        vm={buildWorkflowCockpitViewModel(state)}
        policyProposals={[]}
        onDecidePolicy={() => {}}
        onCarryForward={() => {}}
        onDefer={() => {}}
        onDrop={() => {}}
        onSave={() => {}}
      />,
    );

    // "carry over" claims every still-open item; the scheduled task is open
    // work and is not in this list, so the words have to be narrower.
    expect(screen.getByTestId("review-headline").textContent).not.toMatch(
      /carry over/i,
    );
  });

  it("FINDING 6 — Carry forward leaves the rest of the review reachable", async () => {
    seedStorage(inventorySeedState());

    render(
      <WorkflowProvider>
        <LifeOSCockpit initialStage="review" />
      </WorkflowProvider>,
    );

    const before = await screen.findAllByRole("button", {
      name: "Carry forward",
    });
    expect(before.length).toBeGreaterThan(1);

    fireEvent.click(before[0]);

    // The screen is still a review: the other cards and the day-close action
    // survive one card's decision.
    expect(
      screen.getAllByRole("button", { name: "Carry forward" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Save review" })).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
