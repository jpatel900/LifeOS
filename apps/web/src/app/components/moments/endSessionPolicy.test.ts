import { describe, expect, it, vi } from "vitest";
import { composeEndSessionNote, runEndSessionPolicy } from "./endSessionPolicy";

const outcomes = ["completed", "partial", "skipped", "stuck"] as const;

function dependencies(promptAnswers: Array<string | null> = []) {
  return {
    prompt: vi.fn(() => promptAnswers.shift() ?? null),
    markSession: vi.fn().mockResolvedValue(undefined),
    deferTask: vi.fn(),
  };
}

describe("runEndSessionPolicy", () => {
  it.each(outcomes)(
    "requires a cap decision for %s and maps CUT SCOPE to one completed write",
    async (outcome) => {
      const deps = dependencies(["cut scope", "Smaller DoD"]);

      const result = await runEndSessionPolicy(
        {
          outcome,
          actualMinutes: 25,
          note: "Operator note",
          capReached: true,
          task: {
            id: "task-1",
            definitionOfDone: "Original DoD",
            taskType: null,
          },
        },
        deps,
      );

      expect(result).toEqual({ status: "closed", resolution: "cut_scope" });
      expect(deps.markSession).toHaveBeenCalledOnce();
      expect(deps.markSession).toHaveBeenCalledWith(
        "completed",
        25,
        "Operator note\n\ndod_cap.v1 cut_scope: Smaller DoD",
        "cut_scope",
      );
      expect(deps.deferTask).not.toHaveBeenCalled();
    },
  );

  it("maps DEFER to one stuck write and exactly one task deferral", async () => {
    const deps = dependencies(["defer", "Continue from section two"]);

    const result = await runEndSessionPolicy(
      {
        outcome: "completed",
        actualMinutes: 25,
        note: "Good first pass",
        capReached: true,
        task: {
          id: "task-1",
          definitionOfDone: "Original DoD",
          taskType: null,
        },
      },
      deps,
    );

    expect(result).toEqual({
      status: "split",
      resolution: "defer_unconfirmed",
    });
    expect(deps.markSession).toHaveBeenCalledOnce();
    expect(deps.markSession).toHaveBeenCalledWith(
      "stuck",
      25,
      "Good first pass\n\ndod_cap.v1 deferred: Continue from section two",
      "deferred",
    );
    expect(deps.deferTask).toHaveBeenCalledOnce();
    expect(deps.deferTask).toHaveBeenCalledWith("task-1");
  });

  it("reports a saved session plus failed deferral when defer throws synchronously", async () => {
    const deps = dependencies(["defer", "Continue from section two"]);
    deps.deferTask.mockImplementation(() => {
      throw new Error("defer failed");
    });

    const result = await runEndSessionPolicy(
      {
        outcome: "partial",
        actualMinutes: 25,
        note: null,
        capReached: true,
        task: {
          id: "task-1",
          definitionOfDone: "Original DoD",
          taskType: null,
        },
      },
      deps,
    );

    expect(result).toEqual({ status: "split", resolution: "defer_failed" });
    expect(deps.markSession).toHaveBeenCalledOnce();
    expect(deps.deferTask).toHaveBeenCalledOnce();
  });

  it.each([
    ["cancelled decision", [null]],
    ["invalid decision", ["continue"]],
    ["blank cut scope", ["cut", "   "]],
    ["blank carry note", ["defer", "   "]],
  ])("aborts %s with zero writes", async (_label, answers) => {
    const deps = dependencies(answers);

    const result = await runEndSessionPolicy(
      {
        outcome: "completed",
        actualMinutes: 25,
        note: "Draft stays",
        capReached: true,
        task: {
          id: "task-1",
          definitionOfDone: "Original DoD",
          taskType: null,
        },
      },
      deps,
    );

    expect(result.status).toBe("aborted");
    expect(deps.markSession).not.toHaveBeenCalled();
    expect(deps.deferTask).not.toHaveBeenCalled();
  });

  it("preserves an ordinary non-cap outcome, duration, and note", async () => {
    const deps = dependencies();

    const result = await runEndSessionPolicy(
      {
        outcome: "partial",
        actualMinutes: 7,
        note: "Stopped after the outline",
        capReached: false,
        task: {
          id: "task-1",
          definitionOfDone: "Original DoD",
          taskType: null,
        },
      },
      deps,
    );

    expect(result).toEqual({ status: "closed", resolution: "ordinary" });
    expect(deps.prompt).not.toHaveBeenCalled();
    expect(deps.markSession).toHaveBeenCalledWith(
      "partial",
      7,
      "Stopped after the outline",
    );
  });

  it("does not apply the cap gate when the task has no definition of done", async () => {
    const deps = dependencies();

    const result = await runEndSessionPolicy(
      {
        outcome: "skipped",
        actualMinutes: 25,
        note: null,
        capReached: true,
        task: { id: "task-1", definitionOfDone: null, taskType: null },
      },
      deps,
    );

    expect(result).toEqual({ status: "closed", resolution: "ordinary" });
    expect(deps.prompt).not.toHaveBeenCalled();
    expect(deps.markSession).toHaveBeenCalledWith("skipped", 25, null);
  });

  it("composes decision metadata after the user's note", async () => {
    const deps = dependencies(["Choose vendor B"]);

    await runEndSessionPolicy(
      {
        outcome: "completed",
        actualMinutes: 12,
        note: "Compared both bids",
        capReached: false,
        task: {
          id: "task-1",
          definitionOfDone: null,
          taskType: "decision",
        },
      },
      deps,
    );

    expect(deps.markSession).toHaveBeenCalledWith(
      "completed",
      12,
      "Compared both bids\n\ndecision: Choose vendor B",
    );
  });

  it("keeps null notes null and trims composed parts", () => {
    expect(composeEndSessionNote(null)).toBeNull();
    expect(composeEndSessionNote("  note  ", "  metadata  ")).toBe(
      "note\n\nmetadata",
    );
  });
});
