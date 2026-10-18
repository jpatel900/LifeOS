import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptLatestDraft,
  captureWorkflow,
  planLatestActiveTask,
  workflowSeed,
} from "@/__tests__/helpers/workflowReachability";

/**
 * Calendar hunt #8 (owner decision, option B): a block put on the hour rail
 * is created already accepted, and the bridge only offered proposed/edited
 * proposals — so rail blocks could never reach Google, although the Plan
 * copy promises "Nothing reaches your Google Calendar until you approve it
 * here, one block at a time". A rail block with no Google event must offer
 * the same explicit "Approve Google event" step.
 */
const { approveProposalGoogleWrite, cancelGoogleCalendarBlock } = vi.hoisted(
  () => ({
    approveProposalGoogleWrite: vi.fn(async () => ({
      outcome: "created" as const,
      message: "Google Calendar event created from your approved proposal.",
    })),
    cancelGoogleCalendarBlock: vi.fn(),
  }),
);

vi.mock("@/lib/WorkflowContext", () => ({
  useWorkflow: () => ({
    approveProposalGoogleWrite,
    cancelGoogleCalendarBlock,
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token" } },
        error: null,
      }),
    },
  }),
}));

import { GoogleCalendarApprovalBridge } from "./GoogleCalendarApprovalBridge";

function railBlock() {
  const state = planLatestActiveTask(
    acceptLatestDraft(
      captureWorkflow(workflowSeed(), "Write the grant report"),
    ),
    10,
  );
  const block = state.calendarBlocks.find((b) => b.status === "scheduled")!;
  const task = state.tasks.find((t) => t.id === block.task_id)!;
  expect(block.google_event_id ?? null).toBeNull();
  return { block, task };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ok: true, configured: true, status: "connected" }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GoogleCalendarApprovalBridge — rail blocks (calendar hunt #8)", () => {
  it("offers 'Approve Google event' for a rail block and approves its own proposal", async () => {
    const { block, task } = railBlock();

    render(
      <GoogleCalendarApprovalBridge
        proposals={[]}
        planned={[{ block, task }]}
      />,
    );

    const approve = await screen.findByRole("button", {
      name: `Approve Google event for ${task.title}`,
    });
    await waitFor(() => expect(approve).not.toBeDisabled());
    // A new button on the Plan sheet keeps the 44px touch target rule.
    expect(approve.className).toContain("min-h-[44px]");
    fireEvent.click(approve);

    await waitFor(() =>
      expect(approveProposalGoogleWrite).toHaveBeenCalledWith(
        block.proposal_id,
        { acknowledgeFirstWriteWarning: false },
      ),
    );
    // Not offered as a Google event to cancel: it is not on Google yet.
    expect(
      screen.queryByRole("button", {
        name: `Cancel Google event for ${task.title}`,
      }),
    ).toBeNull();
  });
});
