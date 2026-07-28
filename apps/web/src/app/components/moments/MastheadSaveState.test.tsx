import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MastheadSaveState } from "./MastheadSaveState";
import {
  DEVICE_STORAGE_BLOCKED,
  SIGNED_OUT_SAVING_ON_THIS_DEVICE,
  SOME_WORK_ON_THIS_DEVICE,
} from "@/lib/statusVocabulary";
import {
  initialSyncStatus,
  type WorkflowSyncStatus,
} from "@/lib/workflowContext/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function status(overrides: Partial<WorkflowSyncStatus> = {}) {
  return { ...initialSyncStatus, ...overrides };
}

/**
 * #736, rebuilt in #737 C1 S5 on the truth the durability slices established.
 *
 * The moments home — the shipping shell — showed NOTHING about where a
 * person's work was. `SyncNotice` only ever rendered on the legacy cockpit
 * routes, so a signed-out user could capture, plan and close a day with no
 * indication anywhere that none of it had reached an account.
 */
describe("MastheadSaveState (#737 C1 S5)", () => {
  it("renders nothing while LifeOS is still checking", () => {
    const { container } = render(
      <MastheadSaveState status={status({ account: "checking" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once everything has reached the account", () => {
    // Silence is the resting state, deliberately: a permanent "all synced"
    // badge is furniture the eye learns to skip, and it makes the one state
    // that matters harder to notice.
    const { container } = render(
      <MastheadSaveState
        status={status({ account: "synced", pendingLocalChanges: false })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says where the work is, and offers the door, when nobody is signed in", () => {
    render(
      <MastheadSaveState
        status={status({
          account: "local-only",
          signedOut: true,
          message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
          pendingLocalChanges: true,
        })}
      />,
    );

    expect(screen.getByTestId("masthead-save-state-message")).toHaveTextContent(
      SIGNED_OUT_SAVING_ON_THIS_DEVICE,
    );
    expect(screen.getByTestId("masthead-save-state-signin")).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("keeps the calm treatment for work left on this device, and offers no door", () => {
    // Tone is not decoration. Signed in, account reached, some work still
    // queued is an ORDINARY state — dressing it as a failure is the bug #734
    // fixed in `SyncNotice`, and a second surface must not reintroduce it.
    // There is also no sign-in door here: the user IS signed in, so offering
    // one would point at something that fixes nothing.
    render(
      <MastheadSaveState
        status={status({
          account: "synced",
          message: SOME_WORK_ON_THIS_DEVICE,
          pendingLocalChanges: true,
        })}
      />,
    );

    expect(screen.getByTestId("masthead-save-state")).toHaveAttribute(
      "data-tone",
      "calm",
    );
    expect(screen.getByTestId("masthead-save-state")).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.queryByTestId("masthead-save-state-signin")).toBeNull();
  });

  it("raises the alarm only when the device itself refuses to hold the work", () => {
    render(
      <MastheadSaveState
        status={status({
          storage: "blocked",
          account: "local-only",
          message: DEVICE_STORAGE_BLOCKED,
          pendingLocalChanges: true,
        })}
      />,
    );

    const el = screen.getByTestId("masthead-save-state");
    expect(el).toHaveAttribute("data-tone", "alarm");
    // The one state where a reload really does lose work, so it is announced
    // rather than left for the user to notice.
    expect(el).toHaveAttribute("role", "alert");
    expect(el).toHaveTextContent(DEVICE_STORAGE_BLOCKED);
  });

  /**
   * THE LAYOUT PIN — the recorded reason #736's indicator was pulled.
   *
   * #736 put this INLINE in the masthead's control cluster, a `flex-wrap` row
   * whose width budget three separate audits had already fought over. A
   * variable-length sentence overflowed it at 390px and took an e2e red.
   *
   * The fix is structural, so the pin is structural: this component must never
   * constrain itself to a shared row. `flex-wrap` (so the sentence wraps
   * instead of pushing anything out) and the absence of any width or
   * whitespace-nowrap constraint are what make the 390px case safe, and they
   * are what a future "tidy this into the header" change would quietly remove.
   */
  it("wraps rather than competing for a row, so it cannot overflow a narrow masthead", () => {
    render(
      <MastheadSaveState
        status={status({
          account: "local-only",
          signedOut: true,
          message: SIGNED_OUT_SAVING_ON_THIS_DEVICE,
          pendingLocalChanges: true,
        })}
      />,
    );

    const className = screen.getByTestId("masthead-save-state").className;
    expect(className).toContain("flex-wrap");
    expect(className).not.toContain("whitespace-nowrap");
    expect(className).not.toContain("truncate");
  });
});
