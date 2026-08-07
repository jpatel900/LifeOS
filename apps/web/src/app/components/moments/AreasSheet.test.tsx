import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import type { WorkflowState } from "@/lib/workflow";
import {
  GOLDEN_AREA_ID,
  rawCaptureWorkflow,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";
import { BANNED_ON_USER_SURFACE } from "@/__tests__/helpers/plainLanguageVocabulary";
import { AreasSheet } from "./AreasSheet";

/**
 * C2-S5 (#687) — the ported All-areas surface.
 *
 * Red-first on `origin/main` @ cb53b476: `AreasSheet` does not exist there and
 * the moments shell has no All-areas surface at all — nothing under
 * `components/moments/` even LINKS to the legacy `/areas` route. Every
 * assertion below fails on that base for want of the component.
 *
 * Assertions are anchored on identity — the titles and area ids that must be
 * on screen — never on a bare row count, which can be right for the wrong
 * rows. That distinction is the whole reason this surface exists: the legacy
 * screen's numbers were right about the wrong nouns.
 */

const AREA = GOLDEN_AREA_ID; // "area-main-job"
const OTHER_AREA = "area-personal";

function renderSheet(
  options: {
    open?: boolean;
    state?: WorkflowState;
    selectedAreaId?: string | null;
  } = {},
) {
  const onClose = vi.fn();
  const onSelectArea = vi.fn();
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(options.state ?? workflowSeed()),
  );
  render(
    <WorkflowProvider>
      <AreasSheet
        open={options.open ?? true}
        onClose={onClose}
        selectedAreaId={
          options.selectedAreaId === undefined ? null : options.selectedAreaId
        }
        onSelectArea={onSelectArea}
      />
    </WorkflowProvider>,
  );
  return { onClose, onSelectArea };
}

function columnTitles(id: string) {
  return within(screen.getByTestId(`areas-sheet-column-${id}`))
    .queryAllByRole("listitem")
    .map((node) => node.textContent ?? "");
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("AreasSheet — the ported All-areas surface", () => {
  it("renders nothing when closed", () => {
    renderSheet({ open: false });
    expect(screen.queryByTestId("areas-sheet")).not.toBeInTheDocument();
  });

  it("names its four columns in plain language", () => {
    renderSheet();
    for (const [id, title] of [
      ["decide", "Waiting for a decision"],
      ["plan", "To plan"],
      ["scheduled", "Scheduled"],
      ["done", "Done"],
    ]) {
      expect(screen.getByTestId(`areas-sheet-column-${id}`)).toHaveTextContent(
        title,
      );
    }
  });

  /**
   * S1 FINDING 2 as a rendered regression test. With one unsorted capture in
   * the account, the legacy `/areas` **To triage** column rendered
   * "Nothing is waiting for a decision." — the single thing genuinely waiting
   * was the single thing it could not see.
   */
  it("shows an unsorted capture as waiting for a decision (FINDING 2)", () => {
    const state = rawCaptureWorkflow(workflowSeed(), "Book the dentist");
    renderSheet({ state });

    expect(columnTitles("decide").join(" ")).toContain("Book the dentist");
    expect(
      screen.queryByTestId("areas-sheet-empty-decide"),
    ).not.toBeInTheDocument();
  });

  it("says what an empty column is and one next step, never a bare 'Empty'", () => {
    renderSheet();
    const empty = screen.getByTestId("areas-sheet-empty-decide");
    expect(empty).toHaveTextContent("Nothing is waiting for a decision.");
    expect(empty).toHaveTextContent(
      "Captured thoughts land here until you sort them.",
    );
  });

  /**
   * The surface's central promise: the number on a pill is made of the rows
   * on the same screen, so the two cannot disagree. Asserted by identity —
   * the capture goes into a NAMED area and only that area's pill moves.
   */
  it("prints a per-area count made of the rows shown beside it", () => {
    let state = rawCaptureWorkflow(workflowSeed(), "One for main", AREA);
    state = rawCaptureWorkflow(state, "Two for main", AREA);
    state = rawCaptureWorkflow(state, "One for personal", OTHER_AREA);
    renderSheet({ state });

    const decide = columnTitles("decide").join(" | ");
    expect(decide).toContain("One for main");
    expect(decide).toContain("Two for main");
    expect(decide).toContain("One for personal");

    expect(screen.getByTestId(`areas-sheet-pill-${AREA}`)).toHaveAttribute(
      "aria-label",
      expect.stringContaining("2 open"),
    );
    expect(
      screen.getByTestId(`areas-sheet-pill-${OTHER_AREA}`),
    ).toHaveAttribute("aria-label", expect.stringContaining("1 open"));
  });

  it("summarises the whole account in one plain sentence", () => {
    const state = rawCaptureWorkflow(workflowSeed(), "Just one", AREA);
    renderSheet({ state });
    expect(screen.getByTestId("areas-sheet-summary")).toHaveTextContent(
      "1 thing is open across your",
    );
  });

  it("says nothing is open when nothing is", () => {
    renderSheet();
    expect(screen.getByTestId("areas-sheet-summary")).toHaveTextContent(
      "Nothing is open across your",
    );
  });

  /**
   * Picking here writes the ONE shared selection (#691), and the sheet closes
   * so the change is visible — this surface is global, so staying open would
   * show the person nothing at all in response to their click.
   */
  it("picking an area sets the shared selection and closes", () => {
    const { onClose, onSelectArea } = renderSheet();
    fireEvent.click(screen.getByTestId(`areas-sheet-pill-${AREA}`));
    expect(onSelectArea).toHaveBeenCalledWith(AREA);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("picking All areas clears the selection rather than guessing one", () => {
    const { onClose, onSelectArea } = renderSheet({ selectedAreaId: AREA });
    fireEvent.click(screen.getByTestId("areas-sheet-pill-all"));
    expect(onSelectArea).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks the area currently in scope as pressed, and only that one", () => {
    renderSheet({ selectedAreaId: AREA });
    expect(screen.getByTestId(`areas-sheet-pill-${AREA}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("areas-sheet-pill-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks All areas as pressed when nothing is selected", () => {
    renderSheet({ selectedAreaId: null });
    expect(screen.getByTestId("areas-sheet-pill-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  /**
   * The legacy screen's proportional bar and its pills were two controls doing
   * the identical thing, and a thin area's segment could be ~20px wide —
   * under the 44px floor Target Card 8 pins. The bar is a picture now.
   */
  it("keeps the proportional bar out of the tab order as decoration", () => {
    const state = rawCaptureWorkflow(workflowSeed(), "One", AREA);
    renderSheet({ state });
    const bar = screen.getByTestId("areas-sheet-bar");
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(within(bar).queryAllByRole("button")).toEqual([]);
  });

  it("gives every pill a 44px-tall hit target", () => {
    renderSheet();
    for (const pill of screen.getAllByRole("button")) {
      expect(pill.className).toContain("min-h-[44px]");
    }
  });

  it("speaks plainly — no vendor, infrastructure or developer words", () => {
    const state = rawCaptureWorkflow(workflowSeed(), "Book the dentist", AREA);
    renderSheet({ state });
    const text = screen.getByTestId("areas-sheet").textContent ?? "";
    for (const banned of BANNED_ON_USER_SURFACE) {
      expect(
        banned.test(text),
        `"${banned}" reached the All-areas surface: ${text}`,
      ).toBe(false);
    }
  });
});
