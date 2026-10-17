import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { resolveDeviceSaveNotice } from "@/lib/deviceSaveNotice";

/**
 * Bug hunt #4 — offline, if the device queue refuses the capture (a full
 * quota, blocked site data), the thought used to be saved nowhere while the
 * app said "Captured — saved on this device" and cleared the text. Raw
 * captures must never be lost: the thought stays in this tab's triage pile
 * and the notice says, in the alarm tone, that this browser is not keeping it.
 */
const { mockEnqueueCapture } = vi.hoisted(() => ({
  mockEnqueueCapture: vi.fn(),
}));

vi.mock("@/lib/capture/offlineQueue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/capture/offlineQueue")>()),
  enqueueCapture: mockEnqueueCapture,
}));

function CaptureBridge() {
  const { submitCaptureText, state, syncStatus } = useWorkflow();
  const notice = resolveDeviceSaveNotice(syncStatus);
  return (
    <div>
      <span data-testid="capture-texts">
        {state.captureItems.map((item) => item.raw_text).join("|")}
      </span>
      <span data-testid="notice-tone">{notice?.tone ?? ""}</span>
      <button
        type="button"
        data-testid="submit-offline"
        onClick={() => submitCaptureText("Remember the renewal", null)}
      >
        submit
      </button>
    </div>
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("offline capture when the device queue refuses it (bug hunt #4)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    window.sessionStorage.clear();
    mockEnqueueCapture.mockRejectedValue(
      new DOMException("Quota exceeded", "QuotaExceededError"),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setOnline(true);
    window.sessionStorage.clear();
  });

  it("keeps the thought in this tab and raises an alarm-tone notice", async () => {
    setOnline(false);
    render(
      <WorkflowProvider>
        <CaptureBridge />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("submit-offline"));

    await waitFor(() =>
      expect(screen.getByTestId("capture-texts")).toHaveTextContent(
        "Remember the renewal",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("notice-tone")).toHaveTextContent("alarm"),
    );
  });
});
