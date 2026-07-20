import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CaptureParseNotice,
  SyncNotice,
  WipRefusalPanel,
} from "./StatusBanners";
import type {
  CaptureParseState,
  WorkflowSyncStatus,
} from "@/lib/workflowContext/types";

// #688: SyncNotice reads the current path for its sign-in link's ?next=.
vi.mock("next/navigation", () => ({
  usePathname: () => "/health",
}));
import type { WipRefusal } from "@/lib/workflow/shared";
import { WIP_ENFORCEMENT_POLICY_ID } from "@/lib/workflow/shared";

// #615: every actionable control here reaches the shared >=44px hit-target
// floor via hitTarget.ts (HIT_TARGET_MIN) — never a raw min-h-10 (40px).
// Neither state is reachable through the demo-mode e2e oracle: the mock
// parser never fails a parse (no "Parse with mock parser" retry surfaces),
// and no single e2e run stacks the 3 active/scheduled tasks the WIP
// enforcement policy needs before a 4th refusal. jsdom does not compute
// layout, so this is a className-level guard.

describe("StatusBanners 44px hit targets (#615)", () => {
  it("the capture-parse-failed retry button carries the 44px hit-target class", () => {
    const state: CaptureParseState = {
      phase: "failed",
      captureId: "capture-1",
      status: "ai_unavailable",
      message: "AI parsing failed.",
      canRetryWithMock: true,
    };

    render(<CaptureParseNotice state={state} onRetryWithMock={() => {}} />);

    expect(
      screen.getByRole("button", { name: "Parse with mock parser" }).className,
    ).toContain("min-h-[44px]");
  });

  it("the WIP-refusal 'Keep refused' button carries the 44px hit-target class", () => {
    const refusal: WipRefusal = {
      policy_id: WIP_ENFORCEMENT_POLICY_ID,
      refused_task_id: "task-refused",
      refused_task_title: "A fourth active item",
      activation_path: "triage_accept_to_today",
      slot_holders: [
        {
          task_id: "task-1",
          title: "Holder one",
          status: "active",
          block_id: null,
        },
      ],
      created_at: "2026-07-14T09:00:00.000Z",
    };

    render(
      <WipRefusalPanel
        refusal={refusal}
        onSwap={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Keep refused" }).className,
    ).toContain("min-h-[44px]");
  });
});

// #688: the signed-out condition is one calm state with a door — not the
// amber failure banner — and true failures keep the failure treatment.
describe("SyncNotice signed-out state (#688)", () => {
  const signedOutStatus: WorkflowSyncStatus = {
    storage: "available",
    account: "local-only",
    message: "You're not signed in, so new work is saving on this device only.",
    pendingLocalChanges: true,
    signedOut: true,
  };

  it("renders the calm signed-out banner with a sign-in link back to the current page", () => {
    render(<SyncNotice status={signedOutStatus} />);

    const banner = screen.getByTestId("sync-notice-signed-out");
    expect(banner).toHaveTextContent("You're not signed in");
    // Calm surface tones, not the amber failure treatment.
    expect(banner.className).not.toContain("amb");

    const link = screen.getByTestId("sync-notice-signin-link");
    expect(link).toHaveAttribute("href", "/login?next=%2Fhealth");
    expect(link).toHaveTextContent("Sign in");
  });

  it("keeps failure language and treatment for a real sync error with a live session", () => {
    render(
      <SyncNotice
        status={{
          storage: "available",
          account: "sync-error",
          message: "Account sync failed; changes stay local.",
          pendingLocalChanges: true,
          signedOut: false,
        }}
      />,
    );

    expect(
      screen.queryByTestId("sync-notice-signed-out"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Account sync failed; changes stay local.",
    );
  });
});
