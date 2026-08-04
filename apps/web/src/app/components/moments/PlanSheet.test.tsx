import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { PlanSheet } from "./PlanSheet";

/**
 * C2-S2 (#687) — the ported Plan surface, driven through the REAL
 * `WorkflowProvider` rather than a hand-built view model, so what is proved is
 * the same reducer path `/calendar` drives: select -> place -> the rail shows
 * it -> take it off -> it is gone, and draft -> put on the rail.
 *
 * Red-first on `origin/main` @ c4f96315: `PlanSheet` there renders a schedule
 * summary and an "Open full view →" link. Every assertion below fails on it —
 * there is no hour rail, no to-place list, no proposal control on the moments
 * home at all.
 *
 * The demo seed's one do-today task in `area-main-job` ("Review open tickets")
 * carries `first_tiny_step: null`, which is exactly the FINDING 1 state.
 */

const AREA = GOLDEN_AREA_ID;

/**
 * One do-today task with NO first move (the FINDING 1 state) and one task put
 * off for later, built by driving the SAME reducer transitions the app drives
 * — capture -> accept -> (backlog) — then handed to the provider through the
 * device-storage hydration path it already uses at mount. Nothing here
 * hand-writes a row the app could not have produced.
 */
function seedState() {
  let state = workflowSeed();
  state = captureWorkflow(state, "Review the open tickets before standup");
  state = acceptLatestDraft(state);
  state = captureWorkflow(state, "Sketch the volunteer rota for next month");
  state = backlogLatestDraft(state);
  // FINDING 1's state: neither task has a first move yet. Every task the app
  // seeds ships this way (`lib/mockData.ts` sets `first_tiny_step: null` on
  // all three), so this is the ordinary case the legacy rail lied about — not
  // a contrived one. Anything the capture path staged on the rail is cleared
  // so each assertion below is about the control it names and nothing else.
  return {
    ...state,
    tasks: state.tasks.map((task) => ({ ...task, first_tiny_step: null })),
    timeBlockProposals: [],
    calendarBlocks: [],
  };
}

const SEED = seedState();
const TODAY_TASK = SEED.tasks.find((task) => task.status === "active")!;
const BACKLOG_TASK = SEED.tasks.find((task) => task.status === "backlog")!;

/** Mirrors state back out so assertions read the store, not just the DOM. */
function StateProbe() {
  const { state } = useWorkflow();
  const openBlocks = state.calendarBlocks.filter((block) =>
    ["scheduled", "running"].includes(block.status),
  );
  return (
    <div>
      <span data-testid="probe-open-blocks">{openBlocks.length}</span>
      <span data-testid="probe-proposals">
        {
          state.timeBlockProposals.filter((item) =>
            ["proposed", "edited"].includes(item.status),
          ).length
        }
      </span>
      <span data-testid="probe-scheduled-tasks">
        {state.tasks.filter((task) => task.status === "scheduled").length}
      </span>
    </div>
  );
}

function renderSheet(open = true) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
  return render(
    <WorkflowProvider>
      <StateProbe />
      <PlanSheet
        open={open}
        onClose={vi.fn()}
        selectedAreaId={AREA}
        blocks={[]}
        timeDisplay="clock"
        now={new Date("2026-08-03T09:30:00")}
      />
    </WorkflowProvider>,
  );
}

function probe(id: string) {
  return Number(screen.getByTestId(id).textContent);
}

/** Gets the seeded do-today task ready to place. */
function saveFirstMove() {
  const input = screen.getByTestId(
    `plan-sheet-first-move-input-${TODAY_TASK.id}`,
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "open the ticket list" } });
  fireEvent.click(
    screen.getByTestId(`plan-sheet-first-move-save-${TODAY_TASK.id}`),
  );
}

describe("PlanSheet — the ported Plan surface", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
  });

  it("renders nothing when closed", () => {
    renderSheet(false);
    expect(screen.queryByTestId("plan-sheet")).not.toBeInTheDocument();
  });

  it("shows the whole working day on the rail, not a summary link", () => {
    renderSheet();
    for (const hour of [8, 12, 18]) {
      expect(screen.getByTestId(`plan-sheet-hour-${hour}`)).toBeInTheDocument();
    }
    // The link-out this surface replaced must be gone: this IS the full view.
    expect(
      screen.queryByTestId("plan-sheet-open-full"),
    ).not.toBeInTheDocument();
  });

  describe("FINDING 1 — the rail never invites a placement it will refuse", () => {
    it("says what is missing instead of 'Drop here'", () => {
      renderSheet();
      expect(screen.getByTestId("plan-sheet-hour-9")).toHaveTextContent(
        "Add a first move to put it here",
      );
      expect(screen.getByTestId("plan-sheet-hour-9")).not.toHaveTextContent(
        "Drop here",
      );
    });

    it("tapping it places nothing — the gate still holds", () => {
      renderSheet();
      expect(probe("probe-open-blocks")).toBe(0);

      fireEvent.click(screen.getByTestId("plan-sheet-hour-9"));

      expect(probe("probe-open-blocks")).toBe(0);
      expect(probe("probe-scheduled-tasks")).toBe(0);
    });

    it("tapping it takes the user to the field that unblocks it", async () => {
      renderSheet();
      fireEvent.click(screen.getByTestId("plan-sheet-hour-9"));

      await waitFor(() => {
        expect(
          screen.getByTestId(`plan-sheet-first-move-input-${TODAY_TASK.id}`),
        ).toHaveFocus();
      });
    });

    it("invites the placement by name once a first move exists", async () => {
      renderSheet();
      saveFirstMove();

      await waitFor(() => {
        // The task is named once, above the rail...
        expect(screen.getByTestId("plan-sheet-placing")).toHaveTextContent(
          `Placing ${TODAY_TASK.title}. Pick an hour.`,
        );
      });
      // ...and every open hour offers to take it, in its accessible name too.
      expect(screen.getByTestId("plan-sheet-hour-9")).toHaveTextContent(
        "Tap to put it here",
      );
      expect(screen.getByTestId("plan-sheet-hour-9")).toHaveAttribute(
        "aria-label",
        `9a — tap to put “${TODAY_TASK.title}” here`,
      );
    });
  });

  describe("place -> visible on the rail -> take off -> gone", () => {
    it("places the task on the tapped hour", async () => {
      renderSheet();
      saveFirstMove();
      await waitFor(() =>
        expect(screen.getByTestId("plan-sheet-hour-10")).toHaveTextContent(
          "Tap to put",
        ),
      );

      fireEvent.click(screen.getByTestId("plan-sheet-hour-10"));

      await waitFor(() => expect(probe("probe-open-blocks")).toBe(1));
      expect(probe("probe-scheduled-tasks")).toBe(1);
      const row = screen.getByTestId("plan-sheet-hour-10");
      expect(row).toHaveTextContent(TODAY_TASK.title);
      expect(row).toHaveTextContent("Tap to take it off");
    });

    it("takes it off again, and the rail forgets it", async () => {
      renderSheet();
      saveFirstMove();
      await waitFor(() =>
        expect(screen.getByTestId("plan-sheet-hour-10")).toHaveTextContent(
          "Tap to put",
        ),
      );
      fireEvent.click(screen.getByTestId("plan-sheet-hour-10"));
      await waitFor(() => expect(probe("probe-open-blocks")).toBe(1));

      fireEvent.click(screen.getByTestId("plan-sheet-hour-10"));

      await waitFor(() => expect(probe("probe-open-blocks")).toBe(0));
      const row = screen.getByTestId("plan-sheet-hour-10");
      expect(row).not.toHaveTextContent("Tap to take it off");
      // The hour is open again, and says so by offering the placement back.
      expect(row).toHaveTextContent("Tap to put");
    });
  });

  describe("drafted blocks", () => {
    it("cannot draft a block for a task with no first move", () => {
      renderSheet();
      expect(screen.getByTestId("plan-sheet-draft-block")).toBeDisabled();
    });

    it("drafts, then puts the draft on the rail", async () => {
      renderSheet();
      saveFirstMove();
      await waitFor(() =>
        expect(screen.getByTestId("plan-sheet-draft-block")).toBeEnabled(),
      );

      fireEvent.click(screen.getByTestId("plan-sheet-draft-block"));
      await waitFor(() => expect(probe("probe-proposals")).toBe(1));

      const accept = screen
        .getByTestId("plan-sheet-proposals")
        .querySelector<HTMLButtonElement>(
          '[data-testid^="plan-sheet-proposal-accept-"]',
        );
      expect(accept).not.toBeNull();
      fireEvent.click(accept!);

      await waitFor(() => expect(probe("probe-open-blocks")).toBe(1));
      expect(probe("probe-scheduled-tasks")).toBe(1);
      expect(probe("probe-proposals")).toBe(0);
    });

    it("moves a draft 30 minutes later", async () => {
      renderSheet();
      saveFirstMove();
      await waitFor(() =>
        expect(screen.getByTestId("plan-sheet-draft-block")).toBeEnabled(),
      );
      fireEvent.click(screen.getByTestId("plan-sheet-draft-block"));
      await waitFor(() => expect(probe("probe-proposals")).toBe(1));

      const list = screen.getByTestId("plan-sheet-proposals");
      const before = list.querySelector(
        '[data-testid^="plan-sheet-proposal-when-"]',
      )?.textContent;

      fireEvent.click(
        list.querySelector<HTMLButtonElement>(
          '[data-testid^="plan-sheet-proposal-later-"]',
        )!,
      );

      // Still exactly one draft — moved, not duplicated.
      await waitFor(() => expect(probe("probe-proposals")).toBe(1));
      expect(
        screen
          .getByTestId("plan-sheet-proposals")
          .querySelector('[data-testid^="plan-sheet-proposal-when-"]')
          ?.textContent,
      ).not.toBe(before);
    });

    it("drops a draft", async () => {
      renderSheet();
      saveFirstMove();
      await waitFor(() =>
        expect(screen.getByTestId("plan-sheet-draft-block")).toBeEnabled(),
      );
      fireEvent.click(screen.getByTestId("plan-sheet-draft-block"));
      await waitFor(() => expect(probe("probe-proposals")).toBe(1));

      fireEvent.click(
        screen
          .getByTestId("plan-sheet-proposals")
          .querySelector<HTMLButtonElement>(
            '[data-testid^="plan-sheet-proposal-reject-"]',
          )!,
      );

      await waitFor(() => expect(probe("probe-proposals")).toBe(0));
      expect(probe("probe-open-blocks")).toBe(0);
    });
  });

  describe("put off for later", () => {
    it("will not move a task to today until it has a first move", () => {
      renderSheet();
      expect(
        screen.getByTestId(`plan-sheet-promote-${BACKLOG_TASK.id}`),
      ).toBeDisabled();
    });

    it("moves it to today once the first move is saved", async () => {
      renderSheet();
      const input = screen.getByTestId(
        `plan-sheet-first-move-input-${BACKLOG_TASK.id}`,
      );
      fireEvent.change(input, { target: { value: "open last year's rota" } });
      fireEvent.click(
        screen.getByTestId(`plan-sheet-first-move-save-${BACKLOG_TASK.id}`),
      );

      const promote = await screen.findByTestId(
        `plan-sheet-promote-${BACKLOG_TASK.id}`,
      );
      await waitFor(() => expect(promote).toBeEnabled());
      fireEvent.click(promote);

      await waitFor(() =>
        expect(
          screen.queryByTestId(`plan-sheet-task-${BACKLOG_TASK.id}`),
        ).toBeInTheDocument(),
      );
    });
  });

  it("mounts the Google approval gate rather than writing anything itself", () => {
    renderSheet();
    // The bridge is the one component that may reach an external calendar,
    // and it is reused, not reimplemented.
    expect(
      screen.getByText(
        /Nothing reaches your Google Calendar until you approve/,
      ),
    ).toBeInTheDocument();
  });
});
