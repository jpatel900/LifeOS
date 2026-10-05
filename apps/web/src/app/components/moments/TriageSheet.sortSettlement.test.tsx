import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { createInitialWorkflowState, submitRawCapture } from "@/lib/workflow";
import {
  initialSyncStatus,
  type CaptureParseState,
} from "@/lib/workflowContext/types";
const mocks = vi.hoisted(() => ({ useWorkflow: vi.fn() }));
vi.mock("@/lib/WorkflowContext", () => ({ useWorkflow: mocks.useWorkflow }));
vi.mock("./MomentSheet", () => ({
  MomentSheet: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
}));
import { TriageSheet } from "./TriageSheet";
import { AI_SORTING_OFF_SORTED_HERE } from "@/lib/statusVocabulary";
import { CaptureParseNotice } from "../cockpit/StatusBanners";
const warning =
  "Sorting finished, but the screen may not have updated. Your original thought is kept.";
const parsed: CaptureParseState = {
  phase: "parsed",
  captureId: "synthetic-capture",
  parser: "ai",
  status: "ai_configured",
  warning,
};
afterEach(cleanup);
describe("settled Sort warning at its entry surfaces", () => {
  it("keeps the mock-parser disclosure alongside its settled warning", () => {
    render(
      <CaptureParseNotice
        state={{ ...parsed, parser: "mock", status: "mock" }}
        onRetryWithMock={() => {}}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      AI_SORTING_OFF_SORTED_HERE,
    );
    expect(screen.getByRole("status")).toHaveTextContent(warning);
  });
  it("does not show another area's Sort warning in a scoped sheet", () => {
    const state = submitRawCapture(createInitialWorkflowState(), {
      rawText: "Synthetic other-area thought",
      areaId: "area-personal",
    });
    mocks.useWorkflow.mockReturnValue({
      state,
      syncStatus: initialSyncStatus,
      captureParse: { ...parsed, captureId: state.captureItems[0]!.id },
      taskMapDraft: { phase: "idle" },
    });
    render(
      <TriageSheet open selectedAreaId="area-main-job" onClose={() => {}} />,
    );
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
  });
  it("shows the warning in the current Triage sheet even when its capture row is stale", () => {
    const state = submitRawCapture(createInitialWorkflowState(), {
      rawText: "Synthetic stale row",
      areaId: "area-personal",
    });
    mocks.useWorkflow.mockReturnValue({
      state,
      syncStatus: initialSyncStatus,
      captureParse: { ...parsed, captureId: state.captureItems[0]!.id },
      taskMapDraft: { phase: "idle" },
    });
    render(<TriageSheet open selectedAreaId={null} onClose={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(warning);
    expect(
      screen.queryByRole("button", { name: "Sort on this device" }),
    ).not.toBeInTheDocument();
  });
  it("shows parsed warnings in the existing cockpit notice without offering retry", () => {
    render(<CaptureParseNotice state={parsed} onRetryWithMock={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(warning);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
