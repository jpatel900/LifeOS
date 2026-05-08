import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import CapturePage from "../app/capture/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";

function renderCapturePage() {
  return render(
    <WorkflowProvider>
      <CapturePage />
    </WorkflowProvider>,
  );
}

describe("CapturePage", () => {
  it("renders capture heading and textarea", async () => {
    renderCapturePage();
    expect(await screen.findByText("mock")).toBeDefined();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Capture",
    );
    expect(
      screen.getByPlaceholderText("What's on your mind? Type anything..."),
    ).toBeDefined();
  });

  it("shows mock structured output when structuring text", async () => {
    renderCapturePage();
    expect(await screen.findByText("mock")).toBeDefined();
    const textarea = screen.getByPlaceholderText(
      "What's on your mind? Type anything...",
    );
    fireEvent.change(textarea, { target: { value: "Follow up with Alex" } });
    fireEvent.click(screen.getByText("Structure locally (Phase 2 mock)"));
    expect(
      screen.getByText(/Mock parser created a draft bundle/),
    ).toBeDefined();
  });
});

