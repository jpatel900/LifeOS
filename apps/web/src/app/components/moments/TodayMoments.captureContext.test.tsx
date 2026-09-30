import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import { createInitialWorkflowState, submitRawCapture } from "@/lib/workflow";
import { MOMENTS_PREFS_COOKIE_NAME } from "@/lib/momentsPreferencesCookie";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";
import { resetTodayMomentsMountTracking } from "@/__tests__/helpers/todayMomentsHarness";
import { TodayMoments } from "./TodayMoments";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/reEntry/briefView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reEntry/briefView")>()),
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

const NOW = new Date("2026-07-05T15:00:00.000Z");
const CUSTOM_AREA = "synthetic-custom-area";

function CaptureState() {
  const { state } = useWorkflow();
  return (
    <output data-testid="saved-capture-area">
      {state.captureItems[0]?.area_id ?? ""}
    </output>
  );
}

async function renderCaptureContext(
  area: string | null = "area-main-job",
  captureArea?: string,
) {
  let state = createInitialWorkflowState();
  state = {
    ...state,
    areas: [
      ...state.areas,
      {
        id: CUSTOM_AREA,
        user_id: "synthetic-user",
        name: "Example area",
        color: "#64748b",
        created_at: NOW.toISOString(),
      },
    ],
  };
  if (captureArea) {
    state = submitRawCapture(state, {
      rawText: "Unsorted example",
      areaId: captureArea,
    });
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.history.replaceState(
    null,
    "",
    `/?area=${encodeURIComponent(area ?? "all")}`,
  );
  await act(async () => {
    render(
      <WorkflowProvider>
        <CaptureState />
        <TodayMoments
          now={NOW}
          initialMoment="start"
          deepLink={{ area: area ?? "all" }}
        />
      </WorkflowProvider>,
    );
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=; Path=/; Max-Age=0`;
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  resetTodayMomentsMountTracking();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  document.cookie = `${MOMENTS_PREFS_COOKIE_NAME}=; Path=/; Max-Age=0`;
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("Capture destination and return path", () => {
  it("shows the current area and lets a capture use a custom area without sorting", async () => {
    await renderCaptureContext();
    fireEvent.click(screen.getByTestId("capture-affordance"));
    const dialog = within(
      screen.getByRole("dialog", { name: "Capture a thought" }),
    );
    const area = dialog.getByLabelText("Save to area (optional)");
    expect(area).toHaveValue("area-main-job");
    expect(
      within(area).getByRole("option", { name: "Main Job" }),
    ).toBeInTheDocument();
    fireEvent.change(area, { target: { value: CUSTOM_AREA } });
    fireEvent.change(dialog.getByLabelText("Capture thought"), {
      target: { value: "Synthetic thought" },
    });
    fireEvent.keyDown(dialog.getByLabelText("Capture thought"), {
      key: "Enter",
    });
    expect(screen.getByTestId("saved-capture-area")).toHaveTextContent(
      CUSTOM_AREA,
    );
    expect(dialog.getByLabelText("Save to area (optional)")).toBeDisabled();
  });

  it("keeps area choice optional with one clear destination sentence", async () => {
    await renderCaptureContext(null);
    fireEvent.click(screen.getByTestId("capture-affordance"));
    const dialog = within(
      screen.getByRole("dialog", { name: "Capture a thought" }),
    );
    expect(dialog.getByLabelText("Save to area (optional)")).toHaveValue(
      "area-main-job",
    );
    expect(dialog.getByText("Will save to Main Job.")).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Save to area (optional)"), {
      target: { value: "" },
    });
    expect(
      dialog.queryByText(
        "No area selected. Choose one to control where this thought goes.",
      ),
    ).not.toBeInTheDocument();
    expect(dialog.getByText("Will save without an area.")).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Capture thought"), {
      target: { value: "Synthetic thought" },
    });
    fireEvent.keyDown(dialog.getByLabelText("Capture thought"), {
      key: "Enter",
    });
    expect(screen.getByTestId("saved-capture-area")).toBeEmptyDOMElement();
  });

  it("opens an unassigned waiting thought from Capture when no areas exist", async () => {
    const state = submitRawCapture(
      { ...createInitialWorkflowState(), areas: [] },
      { rawText: "Synthetic thought without an area", areaId: null },
    );
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.history.replaceState(null, "", "/?area=all");
    await act(async () => {
      render(
        <WorkflowProvider>
          <TodayMoments
            now={NOW}
            initialMoment="start"
            deepLink={{ area: "all" }}
          />
        </WorkflowProvider>,
      );
    });
    expect(
      screen.getByTestId("pipeline-overview-count-capture"),
    ).toHaveTextContent("1");
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-capture"));
    expect(screen.getByRole("dialog", { name: "Triage" })).toBeInTheDocument();
    expect(screen.getByTestId("triage-sheet-captures")).toHaveTextContent(
      "Synthetic thought without an area",
    );
  });

  it("opens the counted capture in Triage instead of a new composer", async () => {
    await renderCaptureContext("area-main-job", "area-main-job");
    expect(
      screen.getByTestId("pipeline-overview-count-capture"),
    ).toHaveTextContent("1");
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-capture"));
    expect(screen.getByRole("dialog", { name: "Triage" })).toBeInTheDocument();
    expect(screen.getByTestId("triage-sheet-captures")).toHaveTextContent(
      "Unsorted example",
    );
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
  });

  it("opens captures from every area when All areas has a positive count", async () => {
    await renderCaptureContext(null, "area-personal");
    expect(
      screen.getByTestId("pipeline-overview-count-capture"),
    ).toHaveTextContent("1");
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-capture"));
    expect(screen.getByRole("dialog", { name: "Triage" })).toBeInTheDocument();
    expect(screen.getByTestId("triage-sheet-captures")).toHaveTextContent(
      "Unsorted example",
    );
  });

  it("keeps capture's area choice local to the box and names the destination", async () => {
    await renderCaptureContext("area-main-job");
    fireEvent.click(screen.getByTestId("capture-affordance"));
    const dialog = within(
      screen.getByRole("dialog", { name: "Capture a thought" }),
    );
    const beforeUrl = window.location.href;
    const beforeHistoryLength = window.history.length;
    fireEvent.change(dialog.getByLabelText("Save to area (optional)"), {
      target: { value: CUSTOM_AREA },
    });
    expect(window.location.href).toBe(beforeUrl);
    expect(window.history.length).toBe(beforeHistoryLength);
    expect(dialog.getByText("Will save to Example area.")).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("Capture thought"), {
      target: { value: "Synthetic thought" },
    });
    fireEvent.keyDown(dialog.getByLabelText("Capture thought"), {
      key: "Enter",
    });
    expect(screen.getByTestId("saved-capture-area")).toHaveTextContent(
      CUSTOM_AREA,
    );
  });

  it("opens a new composer when the selected area has no counted captures", async () => {
    await renderCaptureContext("area-main-job", CUSTOM_AREA);
    expect(
      screen.getByTestId("pipeline-overview-caption-capture"),
    ).toHaveTextContent("not sorted yet");
    fireEvent.click(screen.getByTestId("pipeline-overview-stage-capture"));
    expect(
      screen.getByRole("dialog", { name: "Capture a thought" }),
    ).toBeInTheDocument();
  });
});
