import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_SORTING_FAILED_NOT_SORTED,
  AI_SORTING_UNAVAILABLE_NOT_SORTED,
} from "@/lib/statusVocabulary";
import { UnsortedCaptures } from "./UnsortedCaptures";

const { useWorkflow } = vi.hoisted(() => ({ useWorkflow: vi.fn() }));
vi.mock("@/lib/WorkflowContext", () => ({ useWorkflow }));

afterEach(() => vi.clearAllMocks());

describe("Sort recovery copy", () => {
  it.each([
    ["unknown", AI_SORTING_FAILED_NOT_SORTED],
    ["ai_configured", AI_SORTING_FAILED_NOT_SORTED],
    ["ai_unavailable", AI_SORTING_UNAVAILABLE_NOT_SORTED],
  ] as const)(
    "states the sign-in requirement for %s without promising a device fallback",
    (status, message) => {
      const retry = vi.fn();
      useWorkflow.mockReturnValue({
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
          canRetryWithMock: true,
        },
        sortCaptureIntoDrafts: vi.fn(),
        retryCaptureParseWithMock: retry,
      });

      render(<UnsortedCaptures areaId={null} />);

      // Literal expectations keep a shared vocabulary mistake from passing.
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your thought is still saved, exactly as you wrote it. Sorting requires you to be signed in.",
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(
        "You can sort it on this device instead",
      );
      expect(screen.getByRole("status")).not.toHaveTextContent(
        "Sign in to sort",
      );
      expect(screen.getByText("Draft an example")).toBeInTheDocument();
      expect(retry).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole("button", { name: "Try basic sorting" }),
      );
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );
});
