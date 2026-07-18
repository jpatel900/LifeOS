import { buildCockpitViewModel } from "@/lib/cockpit/viewModel";
import type { PolicyChangeCandidate } from "@/lib/learning/overrideScan";
import { cn } from "@/lib/utils";
import { HIT_TARGET_MIN } from "../moments/hitTarget";
import { Panel, ringStyle } from "./shared";

// Review stage screen (extracted from LifeOSCockpit.tsx, issue #590 slice 2
// — mechanical split, no behavior change). Exported (not just the default
// stage-router usage) because __tests__/learningLoopSurfaces.test.tsx
// renders it directly.
export function ReviewView({
  vm,
  policyProposals,
  onDecidePolicy,
  onCarryForward,
  onDefer,
  onDrop,
  onSave,
}: {
  vm: ReturnType<typeof buildCockpitViewModel>;
  policyProposals: PolicyChangeCandidate[];
  onDecidePolicy: (
    candidate: PolicyChangeCandidate,
    decision: "accepted" | "declined",
  ) => void;
  onCarryForward: (taskId: string) => void;
  onDefer: (taskId: string) => void;
  onDrop: (taskId: string) => void;
  onSave: () => void;
}) {
  const total =
    vm.done.length +
    vm.planned.length +
    vm.today.length +
    vm.reviewQueue.length;
  const done = vm.done.length;
  const carry = Math.max(total - done, 0);
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel className="grid place-items-center text-center">
        <div>
          <svg
            width="220"
            height="220"
            viewBox="0 0 220 220"
            className="mx-auto"
          >
            <circle
              cx="110"
              cy="110"
              r="86"
              fill="none"
              stroke="var(--track)"
              strokeWidth="14"
            />
            <circle
              cx="110"
              cy="110"
              r="86"
              fill="none"
              stroke="var(--grn-fg)"
              strokeLinecap="round"
              strokeWidth="14"
              transform="rotate(-90 110 110)"
              style={ringStyle(done, total, 86)}
            />
          </svg>
          {/* #588: this headline renders before Save resolves — the closed
              verdict is reported by the shell toast only after the awaited
              saveReview() result comes back "persisted" (LifeOSCockpit).
              Readiness copy only — never claim the day is closed from this
              screen. */}
          {/* R1 (#660 surface audit): pinned off text-4xl font-extrabold
              (overshoots the fixed type scale and the 700-weight cap) onto
              the shared h1 grammar (2.25rem/700, .moments-greeting). */}
          <h1
            className="moments-greeting mt-4"
            data-testid="review-headline"
          >
            {carry === 0 ? "Ready to close" : `${carry} carry over`}
          </h1>
        </div>
        <button
          type="button"
          onClick={onSave}
          className="mt-7 min-h-12 rounded-full bg-[var(--btn)] px-5 font-bold text-[var(--btn-fg)]"
        >
          Save review
        </button>
      </Panel>
      <Panel>
        {/* R2 (#660 surface audit): the six section h2s in this Panel drop
            the ad-hoc text-xl font-bold treatment for the shared
            .moments-label section-header grammar (sentence case in JSX,
            the class handles uppercase/tracking) — the same choice T2 made
            for eyebrows and SideRail/CloseMoment make for section headers
            (globals.css, .moments-label doc comment). */}
        <h2 className="moments-label">Planned vs actual</h2>
        <div className="mt-5 grid gap-3">
          {vm.sessions.length ? (
            vm.sessions.slice(0, 5).map((session) => (
              <div key={session.id}>
                <div className="mb-1 flex justify-between text-sm text-[var(--mut)]">
                  <span>{session.outcome}</span>
                  <span className="mono">
                    {session.actual_minutes ?? 0}/{session.planned_minutes ?? 0}
                    m
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[var(--track)]">
                  <div
                    className="h-full rounded-full bg-[var(--acc)]"
                    style={{
                      width: `${Math.min(
                        ((session.actual_minutes ?? 0) /
                          Math.max(session.planned_minutes ?? 1, 1)) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </div>
                {session.notes ? (
                  <p
                    className="mt-1 text-xs text-[var(--mut)]"
                    data-testid="review-session-note"
                  >
                    {session.notes}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-[var(--mut)]">
              Focus sessions will appear here.
            </p>
          )}
        </div>
        {vm.reviewQueue.length ? (
          <div className="mt-6 grid gap-3">
            <h2 className="moments-label">Needs recovery</h2>
            {vm.reviewQueue.map((item) => (
              <div
                key={`visible-${item.reason}-${item.task.id}`}
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-[var(--ink)]">
                      {item.task.title}
                    </p>
                    <p className="text-sm capitalize text-[var(--mut)]">
                      {item.reason}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onCarryForward(item.task.id)}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full bg-[var(--acc)] px-4 text-sm font-bold text-[var(--on-acc)]",
                      )}
                    >
                      Carry forward
                    </button>
                    {/* R3 (#660 surface audit): Defer was a second filled
                        pill sharing this card with the "Carry forward"
                        primary — calm-accent discipline keeps one filled
                        primary per card, so this becomes a quiet
                        border/tint secondary (text keeps the --blu-fg
                        identity, the fill is gone). */}
                    <button
                      type="button"
                      onClick={() => onDefer(item.task.id)}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full border border-[var(--blu-rng)] px-4 text-sm font-semibold text-[var(--blu-fg)]",
                      )}
                    >
                      Defer
                    </button>
                    <button
                      type="button"
                      onClick={() => onDrop(item.task.id)}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full border border-[var(--ln2)] px-4 text-sm text-[var(--mut)]",
                      )}
                    >
                      Drop
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {vm.agingWaitingOn.length ? (
          <div
            data-testid="review-aging-waiting-on"
            className="mt-6 grid gap-3"
          >
            <h2 className="moments-label">Waiting on (aging)</h2>
            {vm.agingWaitingOn.map((item) => (
              <div
                key={`waiting-on-${item.task.id}`}
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3"
              >
                <p className="font-bold text-[var(--ink)]">{item.task.title}</p>
                <p className="text-sm text-[var(--mut)]">
                  Waiting {Math.floor(item.ageDays)} day
                  {Math.floor(item.ageDays) === 1 ? "" : "s"} (threshold{" "}
                  {item.thresholdDays})
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {vm.openCommitments.length ? (
          <div
            data-testid="review-open-commitments"
            className="mt-6 grid gap-3"
          >
            <h2 className="moments-label">Open commitments</h2>
            {vm.openCommitments.map((task) => (
              <div
                key={`commitment-${task.id}`}
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3"
              >
                <p className="font-bold text-[var(--ink)]">{task.title}</p>
              </div>
            ))}
          </div>
        ) : null}
        {/* S9 (issue 261): override-pattern policy proposals — propose->approve.
            Approving records the decision; nothing changes automatically. */}
        {policyProposals.length ? (
          <div className="mt-6 grid gap-3" data-testid="policy-proposals">
            <h2 className="moments-label">Policy proposals</h2>
            <p className="text-sm text-[var(--mut)]">
              Patterns from your recent decisions. Approving records your call —
              nothing changes automatically.
            </p>
            {policyProposals.map((candidate) => (
              <div
                key={`${candidate.policyIdentifier}-${candidate.areaId ?? "all"}`}
                data-testid="policy-proposal"
                className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-[var(--ink)]">
                      {candidate.policyIdentifier}
                    </p>
                    <p className="text-sm text-[var(--mut)]">
                      You {candidate.latestOverrideType} it —{" "}
                      {candidate.evidence}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onDecidePolicy(candidate, "accepted")}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full bg-[var(--acc)] px-4 text-sm font-bold text-[var(--on-acc)]",
                      )}
                    >
                      Approve change
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecidePolicy(candidate, "declined")}
                      className={cn(
                        HIT_TARGET_MIN,
                        "rounded-full border border-[var(--ln2)] px-4 text-sm text-[var(--mut)]",
                      )}
                    >
                      Keep as is
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <details className="mt-6 text-[var(--mut)]">
          <summary className="cursor-pointer font-semibold text-[var(--ink)]">
            Carry-forward details
          </summary>
          <p className="mt-3">
            {vm.reviewQueue.length
              ? `${vm.reviewQueue.length} item${
                  vm.reviewQueue.length === 1 ? "" : "s"
                } staged above.`
              : "Nothing needs recovery."}
          </p>
        </details>
      </Panel>
    </div>
  );
}
