import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriftRecoveryCard } from "./DriftRecoveryCard";
import { TaskMapDraftReview } from "./TaskMapDraftReview";
import { TaskMapRevisionOfferCard } from "./TaskMapRevisionOfferCard";

// #783: lead with the action, explain why, then offer the choices. A visible
// recommendation must not remove the alternative or invoke either handler.
describe("Execute action-first choices (#783)", () => {
  it("leads recovery with reclaiming the block, keeping the duration as context", () => {
    const onReclaim = vi.fn();
    const onAbandon = vi.fn();
    render(
      <DriftRecoveryCard
        drift={{ minutes: 12 }}
        onReclaim={onReclaim}
        onAbandon={onAbandon}
      />,
    );
    const card = screen.getByTestId("drift-recovery-card");
    expect(within(card).getByRole("heading")).toHaveTextContent(
      "Reclaim the rest of this block.",
    );
    expect(card).toHaveTextContent("You drifted for ~12 minutes.");
    expect(
      within(card)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Reclaim block", "Fresh start"]);
    expect(screen.getByTestId("drift-recovery-reclaim")).toHaveStyle({
      background: "var(--state-warn)",
    });
    expect(screen.getByTestId("drift-recovery-abandon")).not.toHaveClass(
      "bg-primary",
    );
    expect(onReclaim).not.toHaveBeenCalled();
    expect(onAbandon).not.toHaveBeenCalled();
  });

  it.each([
    [
      false,
      "Review this map before starting.",
      "Right enough to start",
      "Not now",
    ],
    [
      true,
      "Review the changes before replacing your map.",
      "Replace the map",
      "Keep current map",
    ],
  ] as const)(
    "leads map review with the review action (revision=%s)",
    (isRevision, lead, approve, dismiss) => {
      const onApprove = vi.fn();
      const onDismiss = vi.fn();
      render(
        <TaskMapDraftReview
          draft={{
            schema_version: "1.0",
            nodes: [{ id: "first", title: "Open the draft", role: "required" }],
            edges: [],
          }}
          isRevision={isRevision}
          onApprove={onApprove}
          onDismiss={onDismiss}
        />,
      );
      const card = screen.getByTestId("taskmap-draft-review");
      expect(card.firstElementChild).toHaveTextContent(lead);
      const approveButton = screen.getByTestId("taskmap-draft-approve");
      expect(approveButton).toHaveAccessibleName(approve);
      expect(approveButton).toHaveClass("bg-primary");
      const dismissButton = within(card).getByRole("button", { name: dismiss });
      expect(dismissButton).not.toHaveClass("bg-primary");
      expect(card.lastElementChild).toContainElement(approveButton);
      expect(card.lastElementChild).toContainElement(dismissButton);
      expect(onApprove).not.toHaveBeenCalled();
      expect(onDismiss).not.toHaveBeenCalled();
    },
  );

  it.each([null, "Ship the report"])(
    "offers a request before explaining the map mismatch (%s)",
    (taskTitle) => {
      const onPropose = vi.fn();
      const onDismiss = vi.fn();
      render(
        <TaskMapRevisionOfferCard
          taskTitle={taskTitle}
          signals={[
            {
              kind: "cut_scope",
              detail: "You trimmed what this task needs to finish.",
            },
          ]}
          onPropose={onPropose}
          onDismiss={onDismiss}
        />,
      );
      const card = screen.getByTestId("taskmap-revision-offer");
      expect(card.firstElementChild?.textContent).toMatch(
        /^Request an updated map/,
      );
      if (taskTitle) expect(card).toHaveTextContent(taskTitle);
      expect(card).toHaveTextContent(
        "You trimmed what this task needs to finish.",
      );
      const propose = screen.getByTestId("taskmap-revision-offer-propose");
      expect(propose).toHaveAccessibleName("Suggest an update");
      expect(propose).toHaveClass("border", "border-border");
      const dismiss = within(card).getByRole("button", { name: "Not now" });
      expect(dismiss).not.toHaveClass("border-border");
      expect(card.lastElementChild).toContainElement(propose);
      expect(card.lastElementChild).toContainElement(dismiss);
      expect(onPropose).not.toHaveBeenCalled();
      expect(onDismiss).not.toHaveBeenCalled();
    },
  );

  it.each([
    "",
    "Prepare the quarterly accessibility review with Đặng Thị Ngọc Hân",
    "Review <script>alert('fixture')</script> as literal text",
  ])(
    "keeps optional and user-written task titles as text (%s)",
    (taskTitle) => {
      render(
        <TaskMapRevisionOfferCard
          taskTitle={taskTitle}
          signals={[]}
          onPropose={vi.fn()}
          onDismiss={vi.fn()}
        />,
      );
      const card = screen.getByTestId("taskmap-revision-offer");
      expect(card.firstElementChild?.textContent).toMatch(
        /^Request an updated map/,
      );
      expect(card).toHaveTextContent("Work went differently than planned.");
      if (taskTitle) expect(card).toHaveTextContent(taskTitle);
      expect(card.querySelector("script")).toBeNull();
      expect(within(card).getAllByRole("button")).toHaveLength(2);
    },
  );
});
