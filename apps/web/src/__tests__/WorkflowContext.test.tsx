import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";

const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

function replaceSessionStorage(overrides: Partial<Storage>) {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      length: 0,
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
      ...overrides,
    },
  });
}

function WorkflowProbe() {
  const { state, submitCaptureText } = useWorkflow();

  return (
    <div>
      <span data-testid="capture-count">{state.captureItems.length}</span>
      <button
        type="button"
        onClick={() => submitCaptureText("Follow up with Alex", "area-main-job")}
      >
        Add capture
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalSessionStorageDescriptor) {
    Object.defineProperty(
      window,
      "sessionStorage",
      originalSessionStorageDescriptor,
    );
  }
});

describe("WorkflowProvider storage fallback", () => {
  it("falls back to initial state when sessionStorage cannot be read", () => {
    replaceSessionStorage({
      getItem: vi.fn(() => {
        throw new DOMException("Storage is blocked.", "SecurityError");
      }),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("capture-count")).toHaveTextContent("0");
  });

  it("keeps the workflow usable when sessionStorage cannot be written", () => {
    replaceSessionStorage({
      setItem: vi.fn(() => {
        throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
      }),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add capture" }));

    expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
  });
});
