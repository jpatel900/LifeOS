import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { buildPipelineCounts } from "./pipelineCounts";
import {
  acceptLatestDraft,
  backlogLatestDraft,
  captureWorkflow,
  GOLDEN_AREA_ID,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { PlanSheet } from "./PlanSheet";

// Account-mode seams for the #984 editor feedback tests only. With no
// override set, both pass straight through to the real modules, and the
// browser client defaults to `null` (demo mode) — the same mode every
// other test in this file already runs in.
const { mockCreateSupabaseBrowserClient } = vi.hoisted(() => ({
  mockCreateSupabaseBrowserClient: vi.fn(() => null as unknown),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mockCreateSupabaseBrowserClient,
}));

const editorAccountOverrides = vi.hoisted(() => ({
  persist: null as (() => Promise<unknown>) | null,
  sameUser: null as (() => Promise<boolean>) | null,
}));

vi.mock("@/lib/workflowContext/persistenceSync", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/workflowContext/persistenceSync")
    >();
  return {
    ...actual,
    createPersistenceSync: (
      ...args: Parameters<typeof actual.createPersistenceSync>
    ) => {
      const ops = actual.createPersistenceSync(...args);
      return {
        ...ops,
        persistBacklogTaskEdit: (
          ...opArgs: Parameters<typeof ops.persistBacklogTaskEdit>
        ) =>
          editorAccountOverrides.persist
            ? (editorAccountOverrides.persist() as ReturnType<
                typeof ops.persistBacklogTaskEdit
              >)
            : ops.persistBacklogTaskEdit(...opArgs),
        isSameSignedInUser: (expectedUserId: string) =>
          editorAccountOverrides.sameUser
            ? editorAccountOverrides.sameUser()
            : ops.isSameSignedInUser(expectedUserId),
      };
    },
  };
});

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

function renderSheet(
  open = true,
  options: { onToast?: (message: string) => void } = {},
) {
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
        onToast={options.onToast}
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
      const after = screen
        .getByTestId("plan-sheet-proposals")
        .querySelector(
          '[data-testid^="plan-sheet-proposal-when-"]',
        )?.textContent;
      expect(after).not.toBe(before);
      // The legacy card's `edited` status survives the port, in plain words.
      expect(before).not.toContain("moved");
      expect(after).toContain("moved");
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

  describe("edit details (#984)", () => {
    it("opens the form pre-filled, saves title/description/area, and toasts the new area", async () => {
      const onToast = vi.fn();
      renderSheet(true, { onToast });

      fireEvent.click(screen.getByTestId(`plan-sheet-edit-${BACKLOG_TASK.id}`));

      const titleInput = screen.getByTestId(
        `plan-sheet-edit-title-input-${BACKLOG_TASK.id}`,
      ) as HTMLInputElement;
      expect(titleInput.value).toBe(BACKLOG_TASK.title);

      fireEvent.change(titleInput, {
        target: { value: "Sketch next quarter's volunteer rota" },
      });
      fireEvent.change(
        screen.getByTestId(
          `plan-sheet-edit-description-input-${BACKLOG_TASK.id}`,
        ),
        { target: { value: "Include the weekend shifts" } },
      );
      fireEvent.change(
        screen.getByTestId(`plan-sheet-edit-area-input-${BACKLOG_TASK.id}`),
        { target: { value: "area-personal" } },
      );
      fireEvent.click(
        screen.getByTestId(`plan-sheet-edit-save-${BACKLOG_TASK.id}`),
      );

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith("Saved to this tab: Personal");
      });
      // Moving the task to a different area than the one selected here
      // filters it off this list — the toast above is what still names the
      // area it landed in, per the #984 contract.
      expect(
        screen.queryByTestId(`plan-sheet-edit-form-${BACKLOG_TASK.id}`),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId(`plan-sheet-promote-${BACKLOG_TASK.id}`),
      ).not.toBeInTheDocument();
    });

    it("rejects a blank title, keeps the form open, and writes nothing", async () => {
      renderSheet();

      fireEvent.click(screen.getByTestId(`plan-sheet-edit-${BACKLOG_TASK.id}`));
      fireEvent.change(
        screen.getByTestId(`plan-sheet-edit-title-input-${BACKLOG_TASK.id}`),
        { target: { value: "   " } },
      );
      fireEvent.click(
        screen.getByTestId(`plan-sheet-edit-save-${BACKLOG_TASK.id}`),
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`plan-sheet-edit-title-input-${BACKLOG_TASK.id}`),
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(`Move to today: ${BACKLOG_TASK.title}`),
      ).toBeInTheDocument();
    });

    it("cancel closes the form and writes nothing", () => {
      renderSheet();

      fireEvent.click(screen.getByTestId(`plan-sheet-edit-${BACKLOG_TASK.id}`));
      fireEvent.change(
        screen.getByTestId(`plan-sheet-edit-title-input-${BACKLOG_TASK.id}`),
        { target: { value: "Should never be saved" } },
      );
      fireEvent.click(
        screen.getByTestId(`plan-sheet-edit-cancel-${BACKLOG_TASK.id}`),
      );

      expect(
        screen.queryByTestId(`plan-sheet-edit-form-${BACKLOG_TASK.id}`),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(`Move to today: ${BACKLOG_TASK.title}`),
      ).toBeInTheDocument();
    });

    // `expected_updated_at` must be the version the editor OPENED with,
    // frozen at that moment — not re-read from the live task at Save time,
    // which would silently hand a stale draft the task's NEWER token and
    // overwrite whatever changed it in between.
    it("freezes expected_updated_at at open: a background change while the editor is open is rejected as a conflict, and the typed draft survives", async () => {
      renderSheet();

      fireEvent.click(screen.getByTestId(`plan-sheet-edit-${BACKLOG_TASK.id}`));
      const titleInput = screen.getByTestId(
        `plan-sheet-edit-title-input-${BACKLOG_TASK.id}`,
      );
      fireEvent.change(titleInput, {
        target: { value: "My in-progress edit" },
      });

      // A real write to the SAME task while the editor is still open, via a
      // completely different control (the first-move card) — bumps
      // `updated_at` and keeps `status: "backlog"`, exactly the shape a
      // background sync or another tab's edit would produce.
      fireEvent.change(
        screen.getByTestId(`plan-sheet-first-move-input-${BACKLOG_TASK.id}`),
        { target: { value: "open last year's rota" } },
      );
      fireEvent.click(
        screen.getByTestId(`plan-sheet-first-move-save-${BACKLOG_TASK.id}`),
      );

      fireEvent.click(
        screen.getByTestId(`plan-sheet-edit-save-${BACKLOG_TASK.id}`),
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`plan-sheet-edit-error-${BACKLOG_TASK.id}`),
        ).toBeInTheDocument();
      });
      // The account never received "My in-progress edit" as a title —
      // the row still shows the original title unqualified by the conflict.
      expect(
        screen.getByText(`Move to today: ${BACKLOG_TASK.title}`),
      ).toBeInTheDocument();
      // The draft itself was never discarded by the rejected save.
      expect(
        screen.getByTestId(`plan-sheet-edit-title-input-${BACKLOG_TASK.id}`),
      ).toHaveValue("My in-progress edit");
    });

    // Typing while a save is in flight must not be silently lost by a
    // delete-the-draft-on-success that races a same-tick keystroke.
    it("disables the editable inputs while a save is pending", () => {
      renderSheet();

      fireEvent.click(screen.getByTestId(`plan-sheet-edit-${BACKLOG_TASK.id}`));
      fireEvent.click(
        screen.getByTestId(`plan-sheet-edit-save-${BACKLOG_TASK.id}`),
      );

      // Checked synchronously, before the pending microtask resolves:
      // `setEditPending(true)` runs before the awaited `editBacklogTask`
      // call settles, so the inputs are disabled for the whole in-flight
      // window regardless of how quickly demo mode's own write resolves.
      expect(
        screen.getByTestId(`plan-sheet-edit-title-input-${BACKLOG_TASK.id}`),
      ).toBeDisabled();
      expect(
        screen.getByTestId(
          `plan-sheet-edit-description-input-${BACKLOG_TASK.id}`,
        ),
      ).toBeDisabled();
      expect(
        screen.getByTestId(`plan-sheet-edit-area-input-${BACKLOG_TASK.id}`),
      ).toBeDisabled();
    });

    // A blocked area move must say so using the actual saved area (the
    // task's OWN, unchanged area), never the area that was requested and
    // refused.
    it("names the task's own area (not the refused destination) when a project-linked area move is blocked", async () => {
      const project = {
        id: "project-984",
        user_id: SEED.tasks[0].user_id,
        area_id: AREA,
        title: "A project",
        description: null,
        status: "active" as const,
        created_at: "2026-07-04T09:00:00.000Z",
        updated_at: "2026-07-04T09:00:00.000Z",
      };
      const linkedTask = {
        ...BACKLOG_TASK,
        id: "task-project-linked-984",
        project_id: project.id,
        area_id: AREA,
      };
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...SEED,
          projects: [...SEED.projects, project],
          tasks: [...SEED.tasks, linkedTask],
        }),
      );
      const onToast = vi.fn();
      render(
        <WorkflowProvider>
          <StateProbe />
          <PlanSheet
            open
            onClose={vi.fn()}
            selectedAreaId={AREA}
            blocks={[]}
            timeDisplay="clock"
            now={new Date("2026-08-03T09:30:00")}
            onToast={onToast}
          />
        </WorkflowProvider>,
      );

      fireEvent.click(screen.getByTestId(`plan-sheet-edit-${linkedTask.id}`));
      fireEvent.change(
        screen.getByTestId(`plan-sheet-edit-area-input-${linkedTask.id}`),
        { target: { value: "area-personal" } },
      );
      fireEvent.click(
        screen.getByTestId(`plan-sheet-edit-save-${linkedTask.id}`),
      );

      await waitFor(() => {
        expect(onToast).toHaveBeenCalledWith(
          "Saved to this tab. Area kept as Main Job — its project lives there.",
        );
      });
    });

    describe("configured account feedback", () => {
      const WRITER_USER_ID = "writer-user-984";
      const confirmedRow = () => ({
        ...BACKLOG_TASK,
        title: "Sketch next quarter's volunteer rota",
        area_id: "area-personal",
        updated_at: "2030-01-01T00:00:00.000Z",
      });

      beforeEach(() => {
        mockCreateSupabaseBrowserClient.mockReturnValue({ mocked: true });
        editorAccountOverrides.persist = () =>
          Promise.resolve({
            status: "persisted",
            task: confirmedRow(),
            userId: WRITER_USER_ID,
          });
      });

      afterEach(() => {
        mockCreateSupabaseBrowserClient.mockReturnValue(null);
        editorAccountOverrides.persist = null;
        editorAccountOverrides.sameUser = null;
      });

      async function saveAreaMoveToPersonal(
        onToast: (message: string) => void,
      ) {
        renderSheet(true, { onToast });
        fireEvent.click(
          screen.getByTestId(`plan-sheet-edit-${BACKLOG_TASK.id}`),
        );
        fireEvent.change(
          screen.getByTestId(`plan-sheet-edit-area-input-${BACKLOG_TASK.id}`),
          { target: { value: "area-personal" } },
        );
        fireEvent.click(
          screen.getByTestId(`plan-sheet-edit-save-${BACKLOG_TASK.id}`),
        );
      }

      it("ordinary account save names the current account and the actual saved area", async () => {
        editorAccountOverrides.sameUser = () => Promise.resolve(true);
        const onToast = vi.fn<(message: string) => void>();
        await saveAreaMoveToPersonal(onToast);

        await waitFor(() => {
          expect(onToast).toHaveBeenCalledWith(
            "Saved to your account: Personal",
          );
        });
      });

      it("pending reflection after an identity change uses the exact account-neutral message, with no area label", async () => {
        editorAccountOverrides.sameUser = () => Promise.resolve(false);
        const onToast = vi.fn<(message: string) => void>();
        await saveAreaMoveToPersonal(onToast);

        await waitFor(() => {
          expect(onToast).toHaveBeenCalledWith(
            "Saved to the account used for this edit. Reload while signed into that account to confirm the latest details.",
          );
        });
        const messages = onToast.mock.calls.map(([message]) => message);
        expect(messages).toHaveLength(1);
        expect(messages[0]).not.toContain("your account");
        expect(messages[0]).not.toContain("Personal");
        expect(messages[0]).not.toContain("Main Job");
      });
    });
  });

  // The Pipeline rail's Plan badge and this list are visible at the same time
  // (the sheet is a slide-over; the rail stays behind it at desktop width), so
  // a badge reading 0 beside a row is a contradiction one glance catches.
  // `KNOWN_ISSUES` row 11 is the state where the two derivations could
  // disagree: a stale accept left the block `scheduled` while the task stayed
  // `active`. Built with the same reducer transitions as
  // `lib/workflow/planStatus.test.ts`'s fixture, so both guards describe one
  // state rather than two lookalikes.
  it("never lists a task the Plan badge has already stopped counting", async () => {
    // `planLatestActiveTask` stamps the block from the real clock, so "today"
    // has to be the real today or the same-calendar-day test would compare a
    // block on one date against a `now` on another.
    const today = new Date();
    let state = workflowSeed();
    state = captureWorkflow(state, "One thing, counted once.");
    state = acceptLatestDraft(state);
    state = planLatestActiveTask(state, 10);
    const placed = state.calendarBlocks.find(
      (block) => block.status === "scheduled" && block.task_id,
    )!;
    const drifted = {
      ...state,
      tasks: state.tasks.map((task) =>
        task.id === placed.task_id
          ? { ...task, status: "active" as const }
          : task,
      ),
    };

    const badge = buildPipelineCounts(drifted, AREA, { now: today }).plan;
    expect(badge, "the badge stops counting a task already on the rail").toBe(
      0,
    );

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(drifted));
    render(
      <WorkflowProvider>
        <PlanSheet
          open
          onClose={vi.fn()}
          selectedAreaId={AREA}
          blocks={[]}
          timeDisplay="clock"
          now={today}
        />
      </WorkflowProvider>,
    );

    // The provider hydrates from device storage in an effect, so the mount
    // settles a tick after render.
    await waitFor(() =>
      expect(screen.getByTestId("plan-sheet-hour-8")).toBeInTheDocument(),
    );
    const rows =
      screen.queryByTestId("plan-sheet-to-place")?.querySelectorAll("li")
        .length ?? 0;
    expect(rows, "the list agrees with the badge").toBe(badge);
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
