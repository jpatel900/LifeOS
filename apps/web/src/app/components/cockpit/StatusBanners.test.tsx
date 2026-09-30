import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CaptureParseNotice,
  SyncNotice,
  WipRefusalPanel,
} from "./StatusBanners";
import type {
  CaptureParseState,
  WorkflowSyncStatus,
} from "@/lib/workflowContext/types";

import {
  AI_SORTING_FAILED_NOT_SORTED,
  AI_SORTING_UNAVAILABLE_NOT_SORTED,
} from "@/lib/statusVocabulary";
const sortAuth = vi.hoisted(() => ({ getUser: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: sortAuth.configured,
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: sortAuth.getUser,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));
beforeEach(() => {
  sortAuth.configured.mockReturnValue(true);
  sortAuth.getUser.mockResolvedValue({
    data: { user: { email: "synthetic@example.test" } },
    error: null,
  });
});

// #688: SyncNotice reads the current path for its sign-in link's ?next=.
vi.mock("next/navigation", () => ({
  usePathname: () => "/health",
}));
import {
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_UNREACHABLE_NOW,
  DEVICE_STORAGE_BLOCKED,
  SOME_WORK_ON_THIS_DEVICE,
} from "@/lib/statusVocabulary";
import type { WipRefusal } from "@/lib/workflow/shared";
import { WIP_ENFORCEMENT_POLICY_ID } from "@/lib/workflow/shared";

// #615: every actionable control here reaches the shared >=44px hit-target
// floor via hitTarget.ts (HIT_TARGET_MIN) — never a raw min-h-10 (40px).
// Neither state is reachable through the demo-mode e2e oracle: the mock
// parser never fails a parse (no on-device sort retry surfaces),
// and no single e2e run stacks the 3 active/scheduled tasks the WIP
// enforcement policy needs before a 4th refusal. jsdom does not compute
// layout, so this is a className-level guard.

describe("StatusBanners 44px hit targets (#615)", () => {
  it.each([
    [
      "ai_unavailable",
      "AI sorting is unavailable right now, so LifeOS used basic sorting.",
    ],
    ["mock", "AI sorting is turned off, so LifeOS used basic sorting."],
  ] as const)(
    "names basic sorting without promising device execution (%s)",
    (status, message) => {
      render(
        <CaptureParseNotice
          state={{
            phase: "parsed",
            captureId: "capture-1",
            parser: "mock",
            status,
          }}
          onRetryWithMock={() => {}}
        />,
      );
      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(screen.getByRole("status")).not.toHaveTextContent(
        "on your device",
      );
    },
  );

  it("the capture-parse-failed retry button carries the 44px hit-target class", async () => {
    const state: CaptureParseState = {
      phase: "failed",
      captureId: "capture-1",
      status: "ai_unavailable",
      message: "AI parsing failed.",
      canRetryWithMock: true,
    };

    render(<CaptureParseNotice state={state} onRetryWithMock={() => {}} />);

    expect(
      (await screen.findByRole("button", { name: "Try basic sorting" }))
        .className,
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
          message: ACCOUNT_SAVE_FAILED,
          pendingLocalChanges: true,
          signedOut: false,
        }}
      />,
    );

    expect(
      screen.queryByTestId("sync-notice-signed-out"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(ACCOUNT_SAVE_FAILED);
  });
});

// #734: the ordinary device-only states fire on every offline save. They must
// not wear the amber failure treatment; amber belongs to real failures only.
describe("SyncNotice tone (#734)", () => {
  function base(
    overrides: Partial<WorkflowSyncStatus> = {},
  ): WorkflowSyncStatus {
    return {
      storage: "available",
      account: "synced",
      message: null,
      pendingLocalChanges: false,
      ...overrides,
    };
  }

  it("gives an unreachable account the calm treatment, not amber", () => {
    render(
      <SyncNotice
        status={base({
          account: "local-only",
          message: ACCOUNT_UNREACHABLE_NOW,
          pendingLocalChanges: true,
        })}
      />,
    );

    const banner = screen.getByTestId("sync-notice");
    expect(banner).toHaveTextContent(ACCOUNT_UNREACHABLE_NOW);
    expect(banner).toHaveAttribute("data-tone", "calm");
    expect(banner.className).not.toContain("amb");
    expect(banner.className).not.toContain("font-semibold");
  });

  it("gives work left on this device the calm treatment, not amber", () => {
    render(
      <SyncNotice
        status={base({
          message: SOME_WORK_ON_THIS_DEVICE,
          pendingLocalChanges: true,
        })}
      />,
    );

    const banner = screen.getByTestId("sync-notice");
    expect(banner).toHaveTextContent(SOME_WORK_ON_THIS_DEVICE);
    expect(banner).toHaveAttribute("data-tone", "calm");
    expect(banner.className).not.toContain("amb");
  });

  it("keeps amber for a failed save", () => {
    render(
      <SyncNotice
        status={base({
          account: "sync-error",
          message: ACCOUNT_SAVE_FAILED,
          pendingLocalChanges: true,
        })}
      />,
    );

    const banner = screen.getByTestId("sync-notice");
    expect(banner).toHaveAttribute("data-tone", "alarm");
    expect(banner.className).toContain("amb");
  });

  it("keeps amber when the browser blocks storage, even while signed out", () => {
    render(
      <SyncNotice
        status={base({
          storage: "blocked",
          account: "local-only",
          signedOut: true,
        })}
      />,
    );

    const banner = screen.getByTestId("sync-notice");
    expect(banner).toHaveTextContent(DEVICE_STORAGE_BLOCKED);
    expect(banner).toHaveAttribute("data-tone", "alarm");
    expect(banner.className).toContain("amb");
    expect(
      screen.queryByTestId("sync-notice-signin-link"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing once everything has reached the account", () => {
    const { container } = render(<SyncNotice status={base()} />);
    expect(container).toBeEmptyDOMElement();
  });

  // #967 visibility: a queued write whose last account-save attempt is known
  // to have failed must read as a real failure here too — the same
  // `resolveDeviceSaveNotice` `MastheadSaveState` gets.
  describe("pendingSaveFailed (#967)", () => {
    it("raises the alarm for a queued write whose last save attempt failed", () => {
      render(
        <SyncNotice
          status={base({
            pendingLocalChanges: true,
            pendingSaveFailed: true,
          })}
        />,
      );

      const banner = screen.getByTestId("sync-notice");
      expect(banner).toHaveAttribute("data-tone", "alarm");
      expect(banner).toHaveTextContent(ACCOUNT_SAVE_FAILED);
      expect(banner.className).toContain("amb");
    });

    it("stays calm for an ordinary queued write with no failed attempt", () => {
      render(
        <SyncNotice
          status={base({
            pendingLocalChanges: true,
            pendingSaveFailed: false,
          })}
        />,
      );

      const banner = screen.getByTestId("sync-notice");
      expect(banner).toHaveAttribute("data-tone", "calm");
      expect(banner.className).not.toContain("amb");
    });

    it("renders nothing once the failed write is no longer pending", () => {
      const { container } = render(
        <SyncNotice
          status={base({
            pendingLocalChanges: false,
            pendingSaveFailed: true,
          })}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    // #967 root/independent review: the local-only branch must ALSO raise
    // the alarm for a real failed attempt — see `deviceSaveNotice.test.ts`
    // for the full rationale.
    it("raises the alarm for local-only with the generic account-unreachable message, when a save actually failed", () => {
      render(
        <SyncNotice
          status={base({
            account: "local-only",
            message: ACCOUNT_UNREACHABLE_NOW,
            pendingLocalChanges: true,
            pendingSaveFailed: true,
          })}
        />,
      );

      const banner = screen.getByTestId("sync-notice");
      expect(banner).toHaveAttribute("data-tone", "alarm");
      expect(banner).toHaveTextContent(ACCOUNT_SAVE_FAILED);
    });

    it("keeps signed-out priority over a failed attempt", () => {
      render(
        <SyncNotice
          status={base({
            account: "local-only",
            signedOut: true,
            message:
              "You're not signed in, so new work is saving on this device only.",
            pendingLocalChanges: true,
            pendingSaveFailed: true,
          })}
        />,
      );

      expect(screen.getByTestId("sync-notice-signed-out")).toHaveAttribute(
        "data-tone",
        "calm",
      );
      expect(screen.getByTestId("sync-notice-signin-link")).toHaveAttribute(
        "href",
        "/login?next=%2Fhealth",
      );
    });

    it("keeps device-storage-blocked priority over a failed attempt", () => {
      render(
        <SyncNotice
          status={base({
            storage: "blocked",
            account: "local-only",
            pendingLocalChanges: true,
            pendingSaveFailed: true,
          })}
        />,
      );

      const banner = screen.getByTestId("sync-notice");
      expect(banner).toHaveAttribute("data-tone", "alarm");
      expect(banner).toHaveTextContent(DEVICE_STORAGE_BLOCKED);
    });
  });
});

describe("legacy Sort recovery follows current sign-in state", () => {
  it.each(["unknown", "ai_configured", "ai_unavailable"] as const)(
    "offers signed-in recovery for %s",
    async (status) => {
      const state: CaptureParseState = {
        phase: "failed",
        captureId: "synthetic-capture",
        status,
        message:
          status === "ai_unavailable"
            ? AI_SORTING_UNAVAILABLE_NOT_SORTED
            : AI_SORTING_FAILED_NOT_SORTED,
        canRetryWithMock: true,
      };
      render(<CaptureParseNotice state={state} onRetryWithMock={() => {}} />);
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
      expect(
        await screen.findByRole("button", { name: "Try basic sorting" }),
      ).toBeInTheDocument();
    },
  );
  it.each(["unknown", "ai_configured", "ai_unavailable"] as const)(
    "hides signed-out basic recovery for %s",
    async (status) => {
      sortAuth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: null,
      });
      const state: CaptureParseState = {
        phase: "failed",
        captureId: "synthetic-capture",
        status,
        message:
          status === "ai_unavailable"
            ? AI_SORTING_UNAVAILABLE_NOT_SORTED
            : AI_SORTING_FAILED_NOT_SORTED,
        canRetryWithMock: true,
      };
      render(<CaptureParseNotice state={state} onRetryWithMock={() => {}} />);
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Sorting requires you to be signed in.",
        ),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "Your thought is still saved, exactly as you wrote it.",
      );
      expect(
        screen.queryByRole("button", { name: "Try basic sorting" }),
      ).not.toBeInTheDocument();
    },
  );
  it("keeps useful missing-area recovery without an unavailable basic retry", () => {
    const state: CaptureParseState = {
      phase: "failed",
      captureId: "synthetic-capture",
      status: "unknown",
      message: "Add an area before sorting. Your thought remains in Capture.",
      canRetryWithMock: false,
    };
    render(<CaptureParseNotice state={state} onRetryWithMock={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(state.message);
    expect(
      screen.queryByRole("button", { name: "Try basic sorting" }),
    ).not.toBeInTheDocument();
  });
});
