import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestParseCapture } from "@/lib/ai/parseCaptureClient";
import type { CaptureParseState } from "@/lib/workflowContext/types";
import { CaptureParseNotice } from "../cockpit/StatusBanners";
import { UnsortedCaptures } from "./UnsortedCaptures";
import { useAuthPresence } from "./useAuthPresence";

const mocks = vi.hoisted(() => ({ useWorkflow: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/WorkflowContext", () => ({ useWorkflow: mocks.useWorkflow }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
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
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// Exact auth-timeout response at accepted #1070 commit 06d79ee7.
// Exercise the integrated route response through the real client and both notices.
const authTimeoutBody = {
  ok: false,
  errorCategory: "auth_unavailable",
  error: "Sign-in could not be checked. Try sorting again.",
  can_retry_with_mock: false,
};

function Notices({ state }: { state: CaptureParseState }) {
  const { presence } = useAuthPresence();
  return (
    <>
      <span data-testid="auth-presence">{presence.status}</span>
      <UnsortedCaptures areaId={null} />
      <CaptureParseNotice state={state} onRetryWithMock={vi.fn()} />
    </>
  );
}

afterEach(cleanup);

describe("auth-timeout response reaches both Sort notices", () => {
  it.each(["signed-in", "loading", "signed-out"] as const)(
    "keeps the auth-check sentence without basic recovery while %s",
    async (presence) => {
      mocks.getUser.mockReturnValue(
        presence === "loading"
          ? new Promise(() => {})
          : Promise.resolve({
              data: {
                user:
                  presence === "signed-in"
                    ? { email: "synthetic@example.test" }
                    : null,
              },
              error: null,
            }),
      );
      const fetchImpl = vi.fn(async () =>
        Response.json(authTimeoutBody, { status: 503 }),
      );
      const result = await requestParseCapture({
        rawText: "Synthetic saved thought",
        parserMode: "auto",
        authorization: "Bearer synthetic-token",
        fetchImpl,
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "/api/parse-capture",
        expect.objectContaining({ method: "POST" }),
      );
      expect(result).toEqual({
        ok: false,
        status: "unknown",
        error: "Sign-in could not be checked. Try sorting again.",
        canRetryWithMock: false,
      });
      if (result.ok) throw new Error("Expected controlled auth failure");
      const state: CaptureParseState = {
        phase: "failed",
        captureId: "synthetic-capture",
        status: result.status,
        message: result.error,
        canRetryWithMock: result.canRetryWithMock,
      };
      mocks.useWorkflow.mockReturnValue({
        state: {
          areas: [],
          tasks: [],
          taskDrafts: [],
          captureItems: [
            {
              id: "synthetic-capture",
              area_id: null,
              raw_text: "Synthetic saved thought",
              status: "new",
            },
          ],
        },
        captureParse: state,
        sortCaptureIntoDrafts: vi.fn(),
        retryCaptureParseWithMock: vi.fn(),
      });
      render(<Notices state={state} />);
      await waitFor(() =>
        expect(screen.getByTestId("auth-presence")).toHaveTextContent(presence),
      );
      expect(screen.getAllByRole("status")).toHaveLength(2);
      for (const notice of screen.getAllByRole("status")) {
        expect(notice).toHaveTextContent(
          "Sign-in could not be checked. Try sorting again.",
        );
        expect(notice).not.toHaveTextContent(
          "Sorting requires you to be signed in.",
        );
        expect(notice).not.toHaveTextContent("use basic sorting");
      }
      expect(
        screen.queryByRole("button", { name: "Try basic sorting" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("triage-sheet-capture-synthetic-capture"),
      ).toHaveTextContent("Synthetic saved thought");
      expect(
        screen.getByTestId("triage-sheet-capture-synthetic-capture"),
      ).toHaveTextContent("Saved as you wrote it");
    },
  );
});
