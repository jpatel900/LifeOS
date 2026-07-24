import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceSaveIndicator } from "./DeviceSaveIndicator";
import {
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_UNREACHABLE_NOW,
  DEVICE_ONLY_SHORT_LABEL,
  DEVICE_STORAGE_BLOCKED,
  SAVE_PROBLEM_SHORT_LABEL,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  SOME_WORK_ON_THIS_DEVICE,
} from "@/lib/statusVocabulary";
import type { WorkflowSyncStatus } from "@/lib/workflowContext/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

function status(
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

const signedOut = status({
  account: "local-only",
  message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  pendingLocalChanges: true,
  signedOut: true,
});

describe("DeviceSaveIndicator (#734)", () => {
  it("says nothing once every write has reached the account", () => {
    const { container } = render(<DeviceSaveIndicator status={status()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing while LifeOS is still looking", () => {
    const { container } = render(
      <DeviceSaveIndicator status={status({ account: "checking" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the two-word glance label when work is waiting on this device", () => {
    render(<DeviceSaveIndicator status={signedOut} />);

    const trigger = screen.getByTestId("device-save-indicator-trigger");
    expect(trigger).toHaveTextContent(DEVICE_ONLY_SHORT_LABEL);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("device-save-indicator")).toHaveAttribute(
      "data-tone",
      "calm",
    );
  });

  it("announces the whole sentence without needing the detail opened", () => {
    render(<DeviceSaveIndicator status={signedOut} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      SIGNED_OUT_SAVING_ON_THIS_DEVICE,
    );
  });

  it("keeps the detail closed until it is asked for, then unfolds the sentence", () => {
    render(
      <DeviceSaveIndicator
        status={status({
          account: "local-only",
          message: ACCOUNT_UNREACHABLE_NOW,
          pendingLocalChanges: true,
        })}
      />,
    );

    expect(
      screen.queryByTestId("device-save-indicator-detail"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("device-save-indicator-trigger"));

    const detail = screen.getByTestId("device-save-indicator-detail");
    expect(detail).toHaveTextContent(ACCOUNT_UNREACHABLE_NOW);
    expect(screen.getByTestId("device-save-indicator-trigger")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("puts the sign-in door in the detail, only when that is the reason", () => {
    const { unmount } = render(<DeviceSaveIndicator status={signedOut} />);
    fireEvent.click(screen.getByTestId("device-save-indicator-trigger"));
    expect(
      screen.getByTestId("device-save-indicator-signin-link"),
    ).toHaveAttribute("href", "/login?next=%2F");
    unmount();

    render(
      <DeviceSaveIndicator
        status={status({
          message: SOME_WORK_ON_THIS_DEVICE,
          pendingLocalChanges: true,
        })}
      />,
    );
    fireEvent.click(screen.getByTestId("device-save-indicator-trigger"));
    expect(
      screen.queryByTestId("device-save-indicator-signin-link"),
    ).not.toBeInTheDocument();
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    render(<DeviceSaveIndicator status={signedOut} />);
    const trigger = screen.getByTestId("device-save-indicator-trigger");

    fireEvent.click(trigger);
    expect(screen.getByTestId("device-save-indicator-detail")).toBeVisible();

    fireEvent.keyDown(screen.getByTestId("device-save-indicator"), {
      key: "Escape",
    });

    expect(
      screen.queryByTestId("device-save-indicator-detail"),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("reads as ordinary state, never as a failure, for the everyday cases", () => {
    for (const ordinary of [
      signedOut,
      status({
        account: "local-only",
        message: ACCOUNT_UNREACHABLE_NOW,
        pendingLocalChanges: true,
      }),
      status({ message: SOME_WORK_ON_THIS_DEVICE, pendingLocalChanges: true }),
    ]) {
      const { unmount } = render(<DeviceSaveIndicator status={ordinary} />);
      const root = screen.getByTestId("device-save-indicator");
      expect(root).toHaveAttribute("data-tone", "calm");
      expect(
        screen.getByTestId("device-save-indicator-trigger"),
      ).toHaveTextContent(DEVICE_ONLY_SHORT_LABEL);
      unmount();
    }
  });

  it("changes label and tone when a save actually failed", () => {
    render(
      <DeviceSaveIndicator
        status={status({
          account: "sync-error",
          message: ACCOUNT_SAVE_FAILED,
          pendingLocalChanges: true,
        })}
      />,
    );

    expect(screen.getByTestId("device-save-indicator")).toHaveAttribute(
      "data-tone",
      "alarm",
    );
    expect(
      screen.getByTestId("device-save-indicator-trigger"),
    ).toHaveTextContent(SAVE_PROBLEM_SHORT_LABEL);
  });

  it("does not claim the work is on this device when the browser blocks storage", () => {
    render(
      <DeviceSaveIndicator
        status={status({
          storage: "blocked",
          account: "local-only",
          signedOut: true,
        })}
      />,
    );

    const trigger = screen.getByTestId("device-save-indicator-trigger");
    expect(trigger).toHaveTextContent(SAVE_PROBLEM_SHORT_LABEL);
    expect(trigger).not.toHaveTextContent(DEVICE_ONLY_SHORT_LABEL);
    expect(screen.getByRole("status")).toHaveTextContent(
      DEVICE_STORAGE_BLOCKED,
    );
  });

  it("reaches the 44px hit-target floor", () => {
    render(<DeviceSaveIndicator status={signedOut} />);
    expect(
      screen.getByTestId("device-save-indicator-trigger").className,
    ).toContain("min-h-[44px]");
  });
});
