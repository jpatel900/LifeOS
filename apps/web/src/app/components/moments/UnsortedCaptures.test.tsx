import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AI_SORTING_FAILED_NOT_SORTED,
  AI_SORTING_UNAVAILABLE_NOT_SORTED,
} from "@/lib/statusVocabulary";
import { UnsortedCaptures } from "./UnsortedCaptures";
const mocks = vi.hoisted(() => ({
  useWorkflow: vi.fn(),
  getUser: vi.fn(),
  configured: vi.fn(),
}));
vi.mock("@/lib/WorkflowContext", () => ({ useWorkflow: mocks.useWorkflow }));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.configured,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));
function workflow(status: string, message: string, canRetryWithMock = true) {
  const retry = vi.fn();
  mocks.useWorkflow.mockReturnValue({
    state: {
      areas: [],
      tasks: [],
      taskDrafts: [],
      captureItems: [
        {
          id: "synthetic-capture",
          area_id: null,
          raw_text: "Draft an example",
          status: "new",
        },
      ],
    },
    captureParse: {
      phase: "failed",
      captureId: "synthetic-capture",
      status,
      message,
      canRetryWithMock,
    },
    // Deliberately misleading save mode: copy must follow auth, not this field.
    storageMode: "persisted",
    syncStatus: { account: "synced", signedOut: false },
    sortCaptureIntoDrafts: vi.fn(),
    retryCaptureParseWithMock: retry,
  });
  return retry;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.getUser.mockResolvedValue({
    data: { user: { email: "synthetic@example.test" } },
    error: null,
  });
});
afterEach(cleanup);
describe("Sort recovery follows current sign-in state", () => {
  it.each(["unknown", "ai_configured", "ai_unavailable"] as const)(
    "offers working basic recovery for signed-in %s",
    async (status) => {
      const retry = workflow(
        status,
        status === "ai_unavailable"
          ? AI_SORTING_UNAVAILABLE_NOT_SORTED
          : AI_SORTING_FAILED_NOT_SORTED,
      );
      render(<UnsortedCaptures areaId={null} />);
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Try again, or use basic sorting.",
        ),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your thought is still saved, exactly as you wrote it.",
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(
        "Sorting requires you to be signed in.",
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "Try basic sorting" }),
      );
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["unknown", "ai_configured", "ai_unavailable"] as const)(
    "hides auth-only basic recovery for signed-out %s",
    async (status) => {
      mocks.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });
      const retry = workflow(
        status,
        status === "ai_unavailable"
          ? AI_SORTING_UNAVAILABLE_NOT_SORTED
          : AI_SORTING_FAILED_NOT_SORTED,
      );
      render(<UnsortedCaptures areaId={null} />);
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Sorting requires you to be signed in.",
        ),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your thought is still saved, exactly as you wrote it.",
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(
        "Try again, or use basic sorting.",
      );
      expect(
        screen.queryByRole("button", { name: "Try basic sorting" }),
      ).not.toBeInTheDocument();
      expect(retry).not.toHaveBeenCalled();
    },
  );
  it.each(["loading", "unconfigured"] as const)(
    "hides basic recovery while auth is %s",
    (presence) => {
      if (presence === "loading")
        mocks.getUser.mockReturnValueOnce(new Promise(() => {}));
      else mocks.configured.mockReturnValueOnce(false);
      workflow("unknown", AI_SORTING_FAILED_NOT_SORTED);
      render(<UnsortedCaptures areaId={null} />);
      expect(
        screen.queryByRole("button", { name: "Try basic sorting" }),
      ).not.toBeInTheDocument();
    },
  );
  it("keeps a specific auth-check failure and does not offer forbidden recovery", async () => {
    const message = "Sign-in could not be checked. Try sorting again.";
    workflow("unknown", message, false);
    render(<UnsortedCaptures areaId={null} />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(message),
    );
    expect(
      screen.queryByRole("button", { name: "Try basic sorting" }),
    ).not.toBeInTheDocument();
  });
});

// #1091 follow-up: sync swaps a capture's device id for its account id. A
// sort started before the swap must keep showing on the renamed row.
describe("Sort state follows the device -> account id swap", () => {
  const DEVICE_ID = "capture-device-1";
  const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
  function swappedWorkflow(captureParse: Record<string, unknown>) {
    mocks.useWorkflow.mockReturnValue({
      state: {
        areas: [],
        tasks: [],
        taskDrafts: [],
        // The device row is retired; only its account twin is on screen.
        captureItems: [
          {
            id: ACCOUNT_ID,
            area_id: null,
            raw_text: "Draft an example",
            status: "new",
          },
        ],
        accountIdByLocalId: { captures: { [DEVICE_ID]: ACCOUNT_ID } },
      },
      captureParse,
      storageMode: "persisted",
      syncStatus: { account: "synced", signedOut: false },
      sortCaptureIntoDrafts: vi.fn(),
      retryCaptureParseWithMock: vi.fn(),
    });
  }

  it("shows Sorting… on the account row for a sort started under the device id", () => {
    swappedWorkflow({
      phase: "parsing",
      captureId: DEVICE_ID,
      parserMode: "auto",
    });
    render(<UnsortedCaptures areaId={null} />);
    const button = screen.getByTestId(`triage-sheet-sort-${ACCOUNT_ID}`);
    expect(button).toHaveTextContent("Sorting…");
    expect(button).toBeDisabled();
  });

  it("shows a failure recorded under the device id on the account row", async () => {
    swappedWorkflow({
      phase: "failed",
      captureId: DEVICE_ID,
      status: "unknown",
      message: AI_SORTING_FAILED_NOT_SORTED,
      canRetryWithMock: true,
    });
    render(<UnsortedCaptures areaId={null} />);
    expect(
      screen.getByTestId(`triage-sheet-sort-failed-${ACCOUNT_ID}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`triage-sheet-sort-${ACCOUNT_ID}`),
    ).toHaveTextContent("Sort");
  });
});
