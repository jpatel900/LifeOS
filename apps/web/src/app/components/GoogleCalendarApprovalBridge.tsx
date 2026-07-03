"use client";

import { useEffect, useState } from "react";
import type { Phase2TimeBlockProposal } from "@lifeos/schemas";
import { isLifeOsOwnedGoogleEventIdShape } from "@/lib/cockpit/googleCalendarBridge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Phase2MockCalendarBlock, Phase2MockTask } from "@/lib/types";
import { useWorkflow } from "@/lib/WorkflowContext";
import { cn } from "@/lib/utils";

interface GoogleCalendarApprovalBridgeProps {
  proposals: { proposal: Phase2TimeBlockProposal; task: Phase2MockTask }[];
  planned: { block: Phase2MockCalendarBlock; task: Phase2MockTask }[];
}

type BridgeAvailability =
  | { status: "checking" }
  | { status: "ready" }
  | { status: "blocked"; reason: string };

interface BridgeNotice {
  tone: "confirm" | "problem";
  message: string;
}

function formatBlockTime(startAt: string) {
  return new Date(startAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function GoogleCalendarApprovalBridge({
  proposals,
  planned,
}: GoogleCalendarApprovalBridgeProps) {
  const { approveProposalGoogleWrite, cancelGoogleCalendarBlock } =
    useWorkflow();
  const [availability, setAvailability] = useState<BridgeAvailability>({
    status: "checking",
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<BridgeNotice | null>(null);
  const [pendingWarning, setPendingWarning] = useState<{
    proposalId: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    function conclude(next: BridgeAvailability) {
      if (!cancelled) {
        setAvailability(next);
      }
    }

    async function loadAvailability() {
      const client = createSupabaseBrowserClient();

      if (
        !client ||
        !client.auth ||
        typeof client.auth.getSession !== "function"
      ) {
        conclude({
          status: "blocked",
          reason:
            "Google Calendar is unavailable in local-only mode. Local planning keeps working.",
        });
        return;
      }

      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.access_token) {
        conclude({
          status: "blocked",
          reason:
            "Sign in to approve Google Calendar writes. Local planning keeps working.",
        });
        return;
      }

      try {
        const response = await fetch("/api/google-calendar/connection", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          configured?: boolean;
          status?: string;
          error?: string;
        } | null;

        if (!response.ok || !payload?.ok) {
          conclude({
            status: "blocked",
            reason:
              payload?.error ??
              "Google Calendar is not configured on this server. Local planning keeps working.",
          });
          return;
        }

        if (payload.configured === false) {
          conclude({
            status: "blocked",
            reason:
              "Google Calendar is not configured on this server. Local planning keeps working.",
          });
          return;
        }

        if (payload.status !== "connected") {
          conclude({
            status: "blocked",
            reason:
              "Connect Google Calendar in settings before approving writes. Local planning keeps working.",
          });
          return;
        }

        conclude({ status: "ready" });
      } catch {
        conclude({
          status: "blocked",
          reason:
            "Google Calendar status could not load. Local planning keeps working.",
        });
      }
    }

    void loadAvailability();

    return () => {
      cancelled = true;
    };
  }, []);

  const eligibleBlocks = planned.filter((item) =>
    isLifeOsOwnedGoogleEventIdShape(item.block.google_event_id),
  );
  const writable = availability.status === "ready";
  const disabledReason =
    availability.status === "blocked"
      ? availability.reason
      : availability.status === "checking"
        ? "Checking Google Calendar availability."
        : null;

  async function handleApprove(proposalId: string, acknowledge: boolean) {
    setBusyId(proposalId);
    setNotice(null);
    const result = await approveProposalGoogleWrite(proposalId, {
      acknowledgeFirstWriteWarning: acknowledge,
    });
    setBusyId(null);

    if (result.outcome === "first-write-warning") {
      setPendingWarning({ proposalId, message: result.message });
      return;
    }

    setPendingWarning(null);
    setNotice({
      tone: result.outcome === "created" ? "confirm" : "problem",
      message: result.message,
    });
  }

  async function handleCancel(blockId: string) {
    setBusyId(blockId);
    setNotice(null);
    const result = await cancelGoogleCalendarBlock(blockId);
    setBusyId(null);
    setNotice({
      tone: result.outcome === "cancelled" ? "confirm" : "problem",
      message: result.message,
    });
  }

  return (
    <div className="mt-4 grid gap-3" data-testid="google-approval-bridge">
      <h3 className="font-bold">Google approvals</h3>
      {disabledReason ? (
        <p className="text-sm text-[var(--mut)]">{disabledReason}</p>
      ) : null}
      {proposals.length === 0 && eligibleBlocks.length === 0 ? (
        <p className="text-sm text-[var(--mut)]">
          No proposals or LifeOS-created events are waiting for a Google
          decision.
        </p>
      ) : null}
      {proposals.map(({ proposal, task }) => (
        <div
          key={proposal.id}
          className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
        >
          <p className="font-bold">{task.title}</p>
          <p className="mono mt-1 text-sm text-[var(--fnt)]">
            {formatBlockTime(proposal.proposed_start)} · local proposal
          </p>
          {pendingWarning?.proposalId === proposal.id ? (
            <div className="mt-3 grid gap-2">
              <p className="text-sm font-semibold text-[var(--amb-fg)]">
                {pendingWarning.message}
              </p>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void handleApprove(proposal.id, true)}
                className="min-h-10 rounded-full bg-[var(--amb-sf)] px-4 text-sm font-bold text-[var(--amb-fg)]"
              >
                Acknowledge and create Google event
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label={`Approve Google event for ${task.title}`}
              disabled={!writable || busyId !== null}
              onClick={() => void handleApprove(proposal.id, false)}
              className={cn(
                "mt-3 min-h-10 rounded-full px-4 text-sm font-bold",
                writable && busyId === null
                  ? "bg-[var(--acc)] text-[var(--on-acc)]"
                  : "cursor-not-allowed bg-[var(--sf3)] text-[var(--fnt)]",
              )}
            >
              {busyId === proposal.id ? "Approving" : "Approve Google event"}
            </button>
          )}
        </div>
      ))}
      {eligibleBlocks.map(({ block, task }) => (
        <div
          key={block.id}
          className="rounded-2xl border border-[var(--ln)] bg-[var(--sf2)] p-4"
        >
          <p className="font-bold">{task.title}</p>
          <p className="mono mt-1 text-sm text-[var(--fnt)]">
            {formatBlockTime(block.start_at)} · on Google Calendar
          </p>
          <button
            type="button"
            aria-label={`Cancel Google event for ${task.title}`}
            disabled={!writable || busyId !== null}
            onClick={() => void handleCancel(block.id)}
            className={cn(
              "mt-3 min-h-10 rounded-full border px-4 text-sm font-semibold",
              writable && busyId === null
                ? "border-[var(--ln2)] text-[var(--mut)]"
                : "cursor-not-allowed border-[var(--ln)] text-[var(--fnt)]",
            )}
          >
            {busyId === block.id ? "Cancelling" : "Cancel Google event"}
          </button>
        </div>
      ))}
      {notice?.tone === "confirm" ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-[var(--grn-sf)] px-4 py-3 text-sm font-semibold text-[var(--grn-fg)]"
        >
          {notice.message}
        </p>
      ) : null}
      {notice?.tone === "problem" ? (
        <p className="rounded-2xl bg-[var(--amb-sf)] px-4 py-3 text-sm font-semibold text-[var(--amb-fg)]">
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}
