import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { listPendingCaptures } from "@/lib/capture/offlineQueue";

/**
 * FR-027 (F-G1a) integration: a capture submitted while offline must be saved
 * to the durable device queue (survives the device) with no parse wait, and
 * must NOT be staged into the local triage list (it would double-appear once
 * the reconnect sync loads the server row). Uses the real offlineQueue over
 * fake-indexeddb; no Supabase is configured, so the online persist path is
 * inert and only the offline branch is exercised.
 */

function CaptureBridge() {
  const { submitCaptureText, unsyncedCaptureCount, state } = useWorkflow();
  return (
    <div>
      <span data-testid="unsynced">{unsyncedCaptureCount}</span>
      <span data-testid="capture-items">{state.captureItems.length}</span>
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

describe("offline capture (FR-027)", () => {
  beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    // Fresh queue each test.
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("lifeos-capture-queue");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setOnline(true);
  });

  it("saves a capture to the durable queue when offline, without staging it locally", async () => {
    setOnline(false);

    render(
      <WorkflowProvider>
        <CaptureBridge />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByTestId("submit-offline"));

    // The raw capture reaches the durable device queue...
    await waitFor(async () => {
      const pending = await listPendingCaptures();
      expect(pending).toHaveLength(1);
      expect(pending[0].raw_text).toBe("Remember the renewal");
      expect(pending[0].client_capture_id).toBeTruthy();
    });

    // ...and the unsynced-count signal reflects it.
    await waitFor(() =>
      expect(screen.getByTestId("unsynced")).toHaveTextContent("1"),
    );

    // It is NOT staged into the local capture/triage list (avoids a duplicate
    // when the reconnect sync later loads the server row).
    expect(screen.getByTestId("capture-items")).toHaveTextContent("0");
  });
});
