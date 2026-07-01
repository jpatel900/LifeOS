import { describe, expect, it } from "vitest";
import type { TimeBlockProposal } from "@lifeos/schemas";
import {
  adjustedProposalTimes,
  adjustmentLabel,
  normalizeCalendarFailure,
  planningPendingFeedback,
  planningSuccessFeedback,
  proposalConflictSummary,
  proposalHasConflictCheck,
  proposalRationale,
} from "./presentation";

const baseTimes = {
  proposed_start: "2026-06-12T15:00:00.000Z",
  proposed_end: "2026-06-12T16:00:00.000Z",
};

function proposal(overrides: Partial<TimeBlockProposal> = {}) {
  return {
    id: "p1",
    user_id: "u1",
    area_id: "a1",
    task_id: null,
    ...baseTimes,
    rationale_json: {},
    conflict_flag: false,
    conflict_details_json: null,
    status: "proposed",
    created_at: "2026-06-12T14:00:00.000Z",
    ...overrides,
  } as TimeBlockProposal;
}

describe("adjustedProposalTimes", () => {
  it("moves both ends 30 minutes later", () => {
    const result = adjustedProposalTimes(baseTimes, "move_later");
    expect(result.proposed_start).toBe("2026-06-12T15:30:00.000Z");
    expect(result.proposed_end).toBe("2026-06-12T16:30:00.000Z");
  });

  it("extends the end by 30 minutes", () => {
    const result = adjustedProposalTimes(baseTimes, "extend");
    expect(result.proposed_start).toBe(baseTimes.proposed_start);
    expect(result.proposed_end).toBe("2026-06-12T16:30:00.000Z");
  });

  it("shortens without ever inverting the time range", () => {
    const tight = {
      proposed_start: "2026-06-12T15:00:00.000Z",
      proposed_end: "2026-06-12T15:06:00.000Z",
    };
    const result = adjustedProposalTimes(tight, "shorten");
    expect(new Date(result.proposed_end).getTime()).toBeGreaterThan(
      new Date(result.proposed_start).getTime(),
    );
  });
});

describe("proposal status presentation", () => {
  it("labels each adjustment", () => {
    expect(adjustmentLabel("move_later")).toBe("moved 30 minutes later");
    expect(adjustmentLabel("shorten")).toBe("shortened");
    expect(adjustmentLabel("extend")).toBe("extended");
  });

  it("reads rationale from rationale_json note with a fallback", () => {
    expect(
      proposalRationale(
        proposal({ rationale_json: { note: "Morning focus" } }),
      ),
    ).toBe("Morning focus");
    expect(proposalRationale(proposal())).toBe("Local planning proposal.");
    expect(proposalRationale({ rationale: "Direct" })).toBe("Direct");
  });

  it("summarizes conflict state by flag and checked_at", () => {
    expect(
      proposalConflictSummary(proposal({ conflict_flag: true })).label,
    ).toBe("Calendar conflict found");
    const checked = proposal({
      conflict_details_json: { checked_at: "2026-06-12T14:30:00.000Z" },
    });
    expect(proposalHasConflictCheck(checked)).toBe(true);
    expect(proposalConflictSummary(checked).label).toBe("Calendar looks open");
    expect(proposalConflictSummary(proposal()).label).toBe(
      "Calendar not checked",
    );
  });
});

describe("calendar failure and feedback copy", () => {
  it("maps configuration, auth, connection, and duplicate failures", () => {
    expect(
      normalizeCalendarFailure("Service not configured", "google_write").title,
    ).toBe("Google Calendar is not configured");
    expect(
      normalizeCalendarFailure("Sign in before continuing", "conflict_check")
        .title,
    ).toBe("Sign-in required");
    expect(
      normalizeCalendarFailure(
        "Google Calendar is not connected",
        "google_write",
      ).title,
    ).toBe("Google Calendar is disconnected");
    expect(
      normalizeCalendarFailure("duplicate event", "google_write").title,
    ).toBe("Duplicate Google event blocked");
  });

  it("falls back per action kind with recovery-oriented copy", () => {
    expect(normalizeCalendarFailure("boom", "conflict_check").title).toBe(
      "Calendar conflict check failed",
    );
    expect(normalizeCalendarFailure("boom", "google_write").nextStep).toMatch(
      /unchanged/,
    );
    expect(normalizeCalendarFailure("boom", "proposal_mutation").title).toBe(
      "Planning change was not saved",
    );
  });

  it("keeps success and pending feedback keyed by action label", () => {
    expect(
      planningSuccessFeedback({
        label: "Planned block created",
        provider: "supabase",
      }).primaryLink?.href,
    ).toBe("/execute");
    expect(
      planningSuccessFeedback({
        label: "Suggested time removed",
        provider: "mock",
      }).title,
    ).toBe("Suggested time removed");
    expect(planningPendingFeedback({ label: "planned block" }).title).toBe(
      "Creating planned block",
    );
    expect(planningPendingFeedback({ label: "anything else" }).title).toBe(
      "Updating planning",
    );
  });
});
