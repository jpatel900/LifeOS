import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_SAVE_FAILED,
  ACCOUNT_UNREACHABLE_NOW,
  AI_SORTING_OFF_SORTED_HERE,
  AI_SORTING_UNAVAILABLE_SORTED_HERE,
  DEVICE_STORAGE_BLOCKED,
  SOME_WORK_ON_THIS_DEVICE,
  SORT_ON_THIS_DEVICE_ACTION,
} from "@/lib/statusVocabulary";
import type {
  CaptureParseState,
  useWorkflow,
  WorkflowSyncStatus,
} from "@/lib/WorkflowContext";
import { HIT_TARGET_MIN } from "../moments/hitTarget";

// Shell-level status banners (extracted from LifeOSCockpit.tsx, issue #590
// slice 2 — mechanical split, no behavior change). Rendered above the stage
// switch regardless of which stage view is active.

export function SyncNotice({ status }: { status: WorkflowSyncStatus }) {
  const pathname = usePathname();

  // #688: when the ONLY reason sync is off is that nobody is signed in, this
  // is one calm state with a door — quiet surface tones, not the amber
  // failure treatment below, and a link back to this same page after
  // sign-in. True failures (sync-error, blocked storage) keep the amber.
  if (status.signedOut && status.storage !== "blocked") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="sync-notice-signed-out"
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--cockpit-radius)] border border-[var(--ln)] bg-[var(--sf)] px-4 py-3 text-sm text-[var(--mut)]"
      >
        <span>
          {status.message ??
            "You're not signed in, so new work is saving on this device only."}
        </span>
        <Link
          href={`/login?next=${encodeURIComponent(pathname ?? "/")}`}
          className={cn(
            HIT_TARGET_MIN,
            "rounded-full border border-[var(--ln)] px-4 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--sf2)]",
          )}
          data-testid="sync-notice-signin-link"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const messages = [
    status.storage === "blocked" ? DEVICE_STORAGE_BLOCKED : null,
    status.account === "local-only"
      ? (status.message ?? ACCOUNT_UNREACHABLE_NOW)
      : null,
    status.account === "sync-error"
      ? (status.message ?? ACCOUNT_SAVE_FAILED)
      : null,
    status.account === "synced" && status.pendingLocalChanges
      ? (status.message ?? SOME_WORK_ON_THIS_DEVICE)
      : null,
  ].filter(Boolean);

  if (!messages.length) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--cockpit-radius)] border border-[var(--amb-rng)] bg-[var(--amb-sf)] px-4 py-3 text-sm font-semibold text-[var(--amb-fg)]"
    >
      {messages[0]}
    </div>
  );
}

export function CaptureParseNotice({
  state,
  onRetryWithMock,
}: {
  state: CaptureParseState;
  onRetryWithMock: () => void;
}) {
  if (state.phase === "idle") return null;
  if (state.phase === "parsed" && state.parser === "ai") return null;

  const message =
    state.phase === "parsing"
      ? "Parsing capture into drafts…"
      : state.phase === "parsed"
        ? state.status === "ai_unavailable"
          ? AI_SORTING_UNAVAILABLE_SORTED_HERE
          : AI_SORTING_OFF_SORTED_HERE
        : state.message;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="capture-parse-notice"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-[var(--cockpit-radius)] border px-4 py-3 text-sm font-semibold",
        state.phase === "failed"
          ? "border-[var(--amb-rng)] bg-[var(--amb-sf)] text-[var(--amb-fg)]"
          : "border-[var(--ln)] bg-[var(--sf)] text-[var(--mut)]",
      )}
    >
      <span>{message}</span>
      {state.phase === "failed" && state.canRetryWithMock ? (
        <button
          type="button"
          onClick={onRetryWithMock}
          className={cn(
            HIT_TARGET_MIN,
            "rounded-full bg-[var(--btn)] px-4 font-bold text-[var(--btn-fg)]",
          )}
        >
          {SORT_ON_THIS_DEVICE_ACTION}
        </button>
      ) : null}
    </div>
  );
}

export function WipRefusalPanel({
  refusal,
  onSwap,
  onDismiss,
}: {
  refusal: NonNullable<ReturnType<typeof useWorkflow>["state"]["wipRefusal"]>;
  onSwap: (slotTaskId: string) => void;
  onDismiss: () => void;
}) {
  return (
    // C4 (#660 surface audit): rounded-[2rem] retokened to the moments
    // --surface-radius (16px) family; the mono/uppercase/tracking-[0.18em]
    // eyebrow below is now a plain sentence-case label; the heading drops
    // extrabold for the 700-weight cap.
    // C5 (#660 addendum): the slot-holder swap buttons below carried the
    // same two residuals — rounded-2xl (off the 16/10px surface-radius
    // scale) and font-extrabold (over the 700-weight cap) — retokened to
    // --surface-radius-sm (10px, matches the nested-row grammar) and
    // font-bold.
    <div className="mb-5 rounded-[var(--surface-radius)] border border-[var(--amb)] bg-[var(--amb-sf)] p-5 text-[var(--amb-fg)] shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold">
            WIP enforcement · {refusal.policy_id}
          </p>
          <h2 className="mt-2 text-xl font-bold">
            LifeOS refused a fourth active item.
          </h2>
          <p className="mt-2 text-sm font-semibold">
            {refusal.refused_task_title} needs a slot. Pick one current holder
            to swap out, or leave the refusal in place.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            HIT_TARGET_MIN,
            "rounded-full border border-current px-4 text-sm font-bold",
          )}
        >
          Keep refused
        </button>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {refusal.slot_holders.map((holder) => (
          <button
            key={holder.task_id}
            type="button"
            onClick={() => onSwap(holder.task_id)}
            className="rounded-[var(--surface-radius-sm)] bg-[var(--sf1)] p-4 text-left text-[var(--ink)] shadow-sm"
          >
            <span className="text-xs font-semibold text-[var(--fnt)]">
              {holder.status}
            </span>
            <span className="mt-1 block font-bold">{holder.title}</span>
            <span className="mt-3 block text-sm font-bold text-[var(--amb-fg)]">
              Swap this out
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
