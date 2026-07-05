import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import MomentsPreviewPage from "../app/moments-preview/page";

/**
 * Moments pass P6 — packet: deep-link fallback shims. Covers the dev-only
 * /moments-preview route's `?link=<path>` wiring: it reads the query param
 * via next/navigation's useSearchParams, maps it through
 * deepLinkTargetForPath, and passes the result into TodayMoments' deepLink
 * prop — without touching any live route.
 */

const mockSearchParams = vi.fn(() => new URLSearchParams());

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
}));

function renderPreview() {
  return render(
    <WorkflowProvider>
      <MomentsPreviewPage />
    </WorkflowProvider>,
  );
}

describe("MomentsPreviewPage — P6 ?link= deep-link wiring", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("renders TodayMoments with no deep link applied when ?link= is absent", () => {
    renderPreview();

    expect(screen.getByTestId("today-moments")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
  });

  it("opens the capture overlay when ?link=/capture", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("link=/capture"));

    renderPreview();

    expect(screen.getByTestId("capture-overlay")).toBeInTheDocument();
  });

  it("opens the triage sheet when ?link=/triage", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("link=/triage"));

    renderPreview();

    expect(screen.getByTestId("moment-sheet-dialog")).toHaveAttribute(
      "aria-label",
      "Triage",
    );
  });

  it("switches to the flow moment when ?link=/execute", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("link=/execute"));

    renderPreview();

    expect(screen.getByTestId("flow-moment")).toBeInTheDocument();
  });

  it("does not deep-link when ?link=/health (null mapping, full route stays)", () => {
    mockSearchParams.mockReturnValue(new URLSearchParams("link=/health"));

    renderPreview();

    expect(screen.getByTestId("today-moments")).toBeInTheDocument();
    expect(screen.queryByTestId("capture-overlay")).not.toBeInTheDocument();
  });
});
