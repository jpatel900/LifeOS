import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { workflowSeed } from "@/__tests__/helpers/workflowReachability";
import { BANNED_ON_USER_SURFACE } from "@/__tests__/helpers/plainLanguageVocabulary";
import { EverythingSheet } from "./EverythingSheet";

/**
 * The Everything sheet (#1160). The rules are pinned in
 * `lib/everything/everythingList.test.ts`; this file pins what the owner sees
 * and can press. Assertions name the rows that must be on screen, never a
 * bare count.
 */

// Local noon: nothing here depends on the machine's time zone.
const NOW = new Date(2026, 10, 18, 12, 0, 0);
const at = (dayOffset: number) =>
  new Date(2026, 10, 18 + dayOffset, 9, 0, 0).toISOString();

function seededState() {
  const base = workflowSeed();
  const area = {
    id: "area-1",
    user_id: "user-1",
    name: "Work",
    color: "#6d8bff",
    created_at: at(-30),
  };
  const home = { ...area, id: "area-2", name: "Home" };
  const task = {
    user_id: "user-1",
    area_id: "area-1",
    project_id: null,
    source_capture_item_id: null,
    description: null,
    status: "active",
    priority_score: null,
    priority_confidence: null,
    task_type: null,
    energy_type: null,
    estimated_minutes_low: null,
    estimated_minutes_high: null,
    due_at: null,
    definition_of_done: null,
    first_tiny_step: null,
    created_at: at(-4),
    updated_at: at(-4),
  };
  return {
    ...base,
    areas: [area, home],
    taskDrafts: [],
    captureItems: [
      {
        id: "c-hermes",
        user_id: "user-1",
        area_id: "area-1",
        raw_text: "Send the numbers (via Hermes)",
        capture_mode: "text",
        inferred_area_confidence: null,
        status: "new",
        created_at: at(0),
      },
    ],
    tasks: [
      {
        ...task,
        id: "t-today",
        title: "Renew the insurance",
        due_at: at(0),
        priority_score: 3,
      },
      { ...task, id: "t-home", title: "Fix the tap", area_id: "area-2" },
      { ...task, id: "t-done", title: "Pay the bill", status: "done" },
    ],
  } as unknown as ReturnType<typeof workflowSeed>;
}

function renderSheet(
  options: { open?: boolean; state?: ReturnType<typeof workflowSeed> } = {},
) {
  const onClose = vi.fn();
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(options.state ?? seededState()),
  );
  render(
    <WorkflowProvider>
      <EverythingSheet
        open={options.open ?? true}
        onClose={onClose}
        now={NOW}
      />
    </WorkflowProvider>,
  );
  return { onClose };
}

function titlesIn(groupId: string) {
  return within(screen.getByTestId(`everything-group-${groupId}`))
    .getAllByRole("listitem")
    .map((row) => row.textContent ?? "");
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => window.sessionStorage.clear());

describe("EverythingSheet", () => {
  it("renders nothing while closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("everything-sheet")).toBeNull();
  });

  it("states the total and open counts and hides closed items at first", () => {
    renderSheet();
    expect(screen.getByTestId("everything-summary").textContent).toContain(
      "4 items. 3 still open.",
    );
    expect(screen.getByText("Renew the insurance")).toBeTruthy();
    expect(screen.queryByText("Pay the bill")).toBeNull();
    expect(titlesIn("today").join(" ")).toContain("Renew the insurance");
  });

  it("shows closed items on request, in their own group", () => {
    renderSheet();
    const toggle = screen.getByTestId("everything-show-closed");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    // One name whatever its state: the pressed state carries the change.
    expect(toggle.textContent).toContain("Show closed");
    expect(titlesIn("closed").join(" ")).toContain("Pay the bill");
  });

  it("names the stage in words, not colour alone, and shows no priority", () => {
    renderSheet();
    const row = screen.getByTestId("everything-item-task:t-today");
    // A stored score nobody set by hand must not read as the owner's choice.
    expect(screen.queryByTestId("everything-priority")).toBeNull();
    expect(row.textContent).not.toMatch(/priority/i);
    expect(row.textContent).toContain("Ready");
    expect(row.textContent).toContain("Due Today");
  });

  it("gives every row one shape: title, then stage, area and day entered", () => {
    renderSheet();
    const row = screen.getByTestId("everything-item-task:t-home");
    expect(within(row).getByTestId("everything-stage").textContent).toBe(
      "Ready",
    );
    expect(within(row).getByTestId("everything-area-tag").textContent).toBe(
      "Home",
    );
    expect(row.textContent).toContain("Entered Nov 14");
    // No due day: nothing is drawn for it, and a reader still hears why.
    expect(within(row).queryByTestId("everything-due")).toBeNull();
    expect(row.textContent).toContain("No due date");
  });

  it("folds and unfolds a group from its heading, and says which it is", () => {
    renderSheet();
    const fold = screen.getByTestId("everything-fold-today");
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Renew the insurance")).toBeNull();
    // The other groups stay open, and the heading still gives the count.
    expect(screen.getByText("Fix the tap")).toBeTruthy();
    expect(fold.textContent).toContain("Today");
    expect(screen.getByTestId("everything-count-today").textContent).toBe(
      "1 item",
    );
    fireEvent.click(fold);
    expect(screen.getByText("Renew the insurance")).toBeTruthy();
  });

  it("opens a folded group again when a search narrows the list", () => {
    renderSheet();
    const fold = screen.getByTestId("everything-fold-today");
    fireEvent.click(fold);
    expect(screen.queryByText("Renew the insurance")).toBeNull();
    fireEvent.change(screen.getByTestId("everything-search"), {
      target: { value: "insurance" },
    });
    // What the search found is on screen, not hidden behind a fold.
    expect(screen.getByText("Renew the insurance")).toBeTruthy();
    expect(
      screen.getByTestId("everything-fold-today").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("has no column header row: the row itself carries the labels", () => {
    renderSheet();
    const sheet = screen.getByTestId("everything-sheet");
    expect(within(sheet).queryByText("Task")).toBeNull();
    expect(within(sheet).queryByText("Stage", { selector: "span" })).toBeNull();
  });

  it("shows who entered an item and strips the mark from its title", () => {
    renderSheet();
    const row = screen.getByTestId("everything-item-thought:c-hermes");
    expect(row.textContent).toContain("Send the numbers");
    expect(row.textContent).not.toContain("(via Hermes)");
    expect(within(row).getByTestId("everything-source").textContent).toBe(
      "via Hermes",
    );
    fireEvent.change(screen.getByTestId("everything-source-filter"), {
      target: { value: "Hermes" },
    });
    expect(screen.queryByText("Renew the insurance")).toBeNull();
    expect(screen.getByText("Send the numbers")).toBeTruthy();
  });

  it("regroups by area, by stage and by date entered with a trail", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("everything-grouping-area"));
    expect(titlesIn("area-2").join(" ")).toContain("Fix the tap");

    fireEvent.click(screen.getByTestId("everything-grouping-stage"));
    expect(titlesIn("thought").join(" ")).toContain("Send the numbers");

    expect(screen.queryByTestId("everything-trail")).toBeNull();
    fireEvent.click(screen.getByTestId("everything-grouping-entered"));
    const thought = screen.getByTestId("everything-item-thought:c-hermes");
    expect(
      within(thought).getByRole("img", { name: "Got as far as: Thought" }),
    ).toBeTruthy();
    const task = screen.getByTestId("everything-item-task:t-home");
    expect(
      within(task).getByRole("img", { name: "Got as far as: Task" }),
    ).toBeTruthy();
  });

  it("searches by title and offers a way back when nothing matches", () => {
    renderSheet();
    fireEvent.change(screen.getByTestId("everything-search"), {
      target: { value: "tap" },
    });
    expect(screen.getByText("Fix the tap")).toBeTruthy();
    expect(screen.queryByText("Renew the insurance")).toBeNull();

    fireEvent.change(screen.getByTestId("everything-search"), {
      target: { value: "zzz" },
    });
    expect(screen.getByTestId("everything-no-match").textContent).toContain(
      "Nothing matches these filters.",
    );
    expect(screen.getByTestId("everything-shown").textContent).toBe(
      "Showing 0 of 4.",
    );
    fireEvent.click(screen.getByTestId("everything-clear-filters"));
    expect(screen.getByText("Renew the insurance")).toBeTruthy();
  });

  it("offers 'No area' only when something has no area", () => {
    renderSheet();
    expect(
      within(screen.getByTestId("everything-area"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["All areas", "Work", "Home"]);
  });

  it("narrows to items with no area", () => {
    const state = seededState();
    renderSheet({
      state: {
        ...state,
        captureItems: [
          ...state.captureItems,
          {
            ...state.captureItems[0],
            id: "c-loose",
            raw_text: "A loose thought",
            area_id: null,
          },
        ],
      } as ReturnType<typeof workflowSeed>,
    });
    fireEvent.change(screen.getByTestId("everything-area"), {
      target: { value: "__none__" },
    });
    expect(screen.getByText("A loose thought")).toBeTruthy();
    expect(screen.queryByText("Renew the insurance")).toBeNull();
  });

  it("says what is true and what to do when nothing exists yet", () => {
    renderSheet({
      state: { ...workflowSeed(), captureItems: [], taskDrafts: [], tasks: [] },
    });
    expect(screen.getByTestId("everything-summary").textContent).toContain(
      "Nothing here yet.",
    );
    expect(screen.getByTestId("everything-empty").textContent).toContain(
      "Capture a thought",
    );
    expect(screen.queryByTestId("everything-groupings")).toBeNull();
  });

  it("offers the closed items when everything open is finished", () => {
    const state = seededState();
    renderSheet({
      state: {
        ...state,
        captureItems: [],
        tasks: state.tasks.filter((task) => task.status === "done"),
      },
    });
    expect(screen.getByTestId("everything-no-match").textContent).toContain(
      "Nothing is open.",
    );
    fireEvent.click(screen.getByTestId("everything-reveal-closed"));
    expect(screen.getByText("Pay the bill")).toBeTruthy();
  });

  it("uses plain words on every line the owner reads", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("everything-show-closed"));
    const text = screen.getByTestId("everything-sheet").textContent ?? "";
    for (const banned of BANNED_ON_USER_SURFACE) {
      expect(text).not.toMatch(banned);
    }
  });

  it("closes from the shell's own Close control", () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByTestId("moment-sheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
