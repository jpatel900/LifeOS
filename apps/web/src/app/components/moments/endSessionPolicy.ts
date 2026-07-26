import type { EndSessionOutcome } from "./EndSessionSheet";

export type EndSessionAbortReason =
  | "invalid_cap_choice"
  | "missing_cut_scope"
  | "missing_carry_note"
  | "missing_decision";

export type EndSessionResult =
  | {
      status: "closed";
      // #613: "deferred" is the atomic cap-DEFER outcome — the session and
      // the task deferral committed as one transaction, so it is a truthful
      // unified close (see apply_execution_session_defer / #587's
      // collision-resolution carve-out that this issue upgrades).
      resolution: "ordinary" | "cut_scope" | "decision" | "deferred";
    }
  | {
      // Preserved for the local-only/failure paths: the split truth still
      // stands when the transaction did not durably commit (offline, or the
      // RPC threw) — a unified "closed" would lie in those cases.
      status: "split";
      resolution: "defer_unconfirmed" | "defer_failed";
    }
  | { status: "aborted"; reason: EndSessionAbortReason };

interface EndSessionTask {
  id: string;
  definitionOfDone: string | null;
  taskType: string | null;
}

interface EndSessionPolicyInput {
  outcome: EndSessionOutcome;
  actualMinutes: number;
  note: string | null;
  capReached: boolean;
  task: EndSessionTask | null;
  cutScopeNoteDraft?: string;
}

interface EndSessionPolicyDependencies {
  prompt(message: string, defaultValue?: string): string | null;
  markSession(
    outcome: EndSessionOutcome,
    actualMinutes: number,
    note: string | null,
    capOutcome?: "cut_scope" | "deferred",
  ): Promise<void>;
  // #613: the atomic cap-DEFER path — replaces the prior markSession(cap
  // "deferred") + deferTask(taskId) two-call split with one transactional
  // call that reports which of the three real outcomes happened.
  deferTaskWithSession(
    taskId: string,
    actualMinutes: number,
    notes: string | null,
  ): Promise<"persisted" | "local-only" | "failure">;
}

export function composeEndSessionNote(
  ...parts: Array<string | null | undefined>
): string | null {
  const present = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return present.length > 0 ? present.join("\n\n") : null;
}

function normalized(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

export async function runEndSessionPolicy(
  input: EndSessionPolicyInput,
  dependencies: EndSessionPolicyDependencies,
): Promise<EndSessionResult> {
  const capGateApplies =
    input.capReached && Boolean(input.task?.definitionOfDone?.trim());

  if (capGateApplies && input.task) {
    const choice = normalized(
      dependencies.prompt(
        "The time cap is here. Choose: 1 cut scope and close done, or 2 defer with a carry note.",
      ),
    );

    if (choice === "1" || choice === "cut" || choice === "cut scope") {
      const revisedDod = dependencies
        .prompt(
          "Cut scope: write the definition of done that is true now.",
          input.cutScopeNoteDraft?.trim() || undefined,
        )
        ?.trim();
      if (!revisedDod)
        return { status: "aborted", reason: "missing_cut_scope" };

      await dependencies.markSession(
        "completed",
        input.actualMinutes,
        composeEndSessionNote(
          input.note,
          `dod_cap.v1 cut_scope: ${revisedDod}`,
        ),
        "cut_scope",
      );
      return { status: "closed", resolution: "cut_scope" };
    }

    if (choice === "2" || choice === "defer" || choice === "deferred") {
      const carryNote = dependencies
        .prompt("Defer: write one carry note for the next block or backlog.")
        ?.trim();
      if (!carryNote)
        return { status: "aborted", reason: "missing_carry_note" };

      // #613: one transactional call carries the session outcome AND the
      // task deferral together — the result IS the truth this policy
      // reports, never an assumed/optimistic "split".
      const deferResult = await dependencies.deferTaskWithSession(
        input.task.id,
        input.actualMinutes,
        composeEndSessionNote(input.note, `dod_cap.v1 deferred: ${carryNote}`),
      );

      if (deferResult === "persisted") {
        return { status: "closed", resolution: "deferred" };
      }
      return {
        status: "split",
        resolution:
          deferResult === "local-only" ? "defer_unconfirmed" : "defer_failed",
      };
    }

    return { status: "aborted", reason: "invalid_cap_choice" };
  }

  if (input.outcome === "completed" && input.task?.taskType === "decision") {
    const decision = dependencies
      .prompt("Record the decision choice as free text before closing.")
      ?.trim();
    if (!decision) return { status: "aborted", reason: "missing_decision" };

    await dependencies.markSession(
      input.outcome,
      input.actualMinutes,
      composeEndSessionNote(input.note, `decision: ${decision}`),
    );
    return { status: "closed", resolution: "decision" };
  }

  await dependencies.markSession(
    input.outcome,
    input.actualMinutes,
    input.note,
  );
  return { status: "closed", resolution: "ordinary" };
}
