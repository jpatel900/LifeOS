"use client";

import { useEffect, useState } from "react";
import type { CalendarBlock, Task, TimeBlockProposal } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import {
  acceptTimeBlockProposal,
  checkTimeBlockProposalConflict,
  createGoogleCalendarEventFromProposal,
  createTimeBlockProposal,
  editTimeBlockProposal,
  listPlanningItems,
  rejectTimeBlockProposal,
  type DataProvider,
} from "@/lib/data/workflow";
import { getAreaById } from "@/lib/mockData";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";

type PlanningState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      provider: DataProvider;
      tasks: Task[];
      proposals: TimeBlockProposal[];
      blocks: CalendarBlock[];
    };

type ActionState =
  | { status: "idle" }
  | { status: "saving"; label: string }
  | { status: "saved"; label: string; provider: DataProvider }
  | { status: "error"; message: string };

type GoogleConnectionState =
  | { status: "loading" }
  | {
      status: "ready";
      connected: boolean;
      firstWriteWarningAcknowledged: boolean;
    }
  | { status: "error"; message: string };

type GoogleCalendarConnectionResponse = {
  ok: boolean;
  connection?: {
    first_write_warning_acknowledged_at: string | null;
    status: "connected" | "disconnected" | "error" | "metadata_only";
  } | null;
  status?: "connected" | "disconnected" | "error";
  error?: string;
};

function nextLocalSlot(task: Task) {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const minutes = task.estimated_minutes_high ?? task.estimated_minutes_low ?? 45;
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  return {
    proposed_start: start.toISOString(),
    proposed_end: end.toISOString(),
  };
}

function proposalRationale(proposal: TimeBlockProposal | { rationale: string }) {
  if ("rationale" in proposal) {
    return proposal.rationale;
  }

  const payload = proposal.rationale_json;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "note" in payload
  ) {
    return String(payload.note);
  }

  return "Local planning proposal.";
}

function proposalConflictSummary(proposal: TimeBlockProposal) {
  const details = proposal.conflict_details_json;
  const hasCheckedConflict =
    details &&
    typeof details === "object" &&
    !Array.isArray(details) &&
    typeof (details as Record<string, unknown>).checked_at === "string";

  if (proposal.conflict_flag) {
    return {
      label: "Conflict flagged",
      backgroundColor: "#fee2e2",
      color: "#b91c1c",
    };
  }

  if (hasCheckedConflict) {
    return {
      label: "No conflict detected",
      backgroundColor: "#dcfce7",
      color: "#166534",
    };
  }

  return {
    label: "Conflict not checked",
    backgroundColor: "#e5e7eb",
    color: "#374151",
  };
}

export default function CalendarPage() {
  const {
    state,
    selectedAreaId,
    acceptLocalProposal,
    rejectLocalProposal,
    editLocalProposal,
  } = useWorkflow();
  const [planningState, setPlanningState] = useState<PlanningState>({
    status: "loading",
  });
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  const [googleConnectionState, setGoogleConnectionState] =
    useState<GoogleConnectionState>({ status: "loading" });
  const [acknowledgeFirstWriteWarning, setAcknowledgeFirstWriteWarning] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPlanningItems() {
      try {
        const result = await listPlanningItems(createSupabaseBrowserClient());
        if (!cancelled) {
          setPlanningState({
            status: "ready",
            provider: result.provider,
            tasks: result.tasks,
            proposals: result.proposals,
            blocks: result.blocks,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setPlanningState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load planning rows.",
          });
        }
      }
    }

    void loadPlanningItems();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGoogleConnection() {
      const client = createSupabaseBrowserClient();

      if (!client?.auth?.getSession) {
        if (!cancelled) {
          setGoogleConnectionState({
            status: "ready",
            connected: false,
            firstWriteWarningAcknowledged: false,
          });
        }
        return;
      }

      const { data, error } = await client.auth.getSession();

      if (error || !data.session?.access_token) {
        if (!cancelled) {
          setGoogleConnectionState({
            status: "ready",
            connected: false,
            firstWriteWarningAcknowledged: false,
          });
        }
        return;
      }

      try {
        const response = await fetch("/api/google-calendar/connection", {
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        });
        const payload =
          (await response.json()) as GoogleCalendarConnectionResponse;

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ?? "Google Calendar connection could not load.",
          );
        }

        if (!cancelled) {
          setGoogleConnectionState({
            status: "ready",
            connected: payload.status === "connected",
            firstWriteWarningAcknowledged: Boolean(
              payload.connection?.first_write_warning_acknowledged_at,
            ),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setGoogleConnectionState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Google Calendar connection could not load.",
          });
        }
      }
    }

    void loadGoogleConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  const usesPersistedPlanning =
    planningState.status === "ready" && planningState.provider === "supabase";

  async function handleCreateProposal(task: Task) {
    setActionState({ status: "saving", label: task.title });

    try {
      const result = await createTimeBlockProposal(createSupabaseBrowserClient(), {
        task_id: task.id,
        ...nextLocalSlot(task),
      });

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? { ...current, proposals: [result.proposal, ...current.proposals] }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Proposal saved through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to create proposal.",
      });
    }
  }

  async function handleEditProposal(proposal: TimeBlockProposal) {
    const editedStart = new Date(proposal.proposed_start);
    editedStart.setMinutes(editedStart.getMinutes() + 30);
    const editedEnd = new Date(proposal.proposed_end);
    editedEnd.setMinutes(editedEnd.getMinutes() + 30);

    setActionState({ status: "saving", label: "proposal edit" });
    try {
      const result = await editTimeBlockProposal(
        createSupabaseBrowserClient(),
        proposal.id,
        {
          proposed_start: editedStart.toISOString(),
          proposed_end: editedEnd.toISOString(),
        },
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Proposal edited through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to edit proposal.",
      });
    }
  }

  async function handleRejectProposal(proposalId: string) {
    setActionState({ status: "saving", label: "proposal rejection" });
    try {
      const result = await rejectTimeBlockProposal(
        createSupabaseBrowserClient(),
        proposalId,
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Proposal rejected through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to reject proposal.",
      });
    }
  }

  async function handleAcceptProposal(proposalId: string) {
    setActionState({ status: "saving", label: "local block" });
    try {
      const result = await acceptTimeBlockProposal(
        createSupabaseBrowserClient(),
        proposalId,
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
              blocks: [result.block, ...current.blocks],
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Local block created through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to accept proposal.",
      });
    }
  }

  async function handleCheckConflict(proposalId: string) {
    setActionState({ status: "saving", label: "conflict check" });
    try {
      const result = await checkTimeBlockProposalConflict(
        createSupabaseBrowserClient(),
        proposalId,
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
            }
          : current,
      );
      setActionState({
        status: "saved",
        label: "Conflict checked through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to check Google Calendar conflict.",
      });
    }
  }

  async function handleCreateGoogleEvent(proposalId: string) {
    setActionState({ status: "saving", label: "Google Calendar event" });
    try {
      const result = await createGoogleCalendarEventFromProposal(
        createSupabaseBrowserClient(),
        {
          acknowledge_first_write_warning: acknowledgeFirstWriteWarning,
          approved: true,
          proposal_id: proposalId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
      );

      setPlanningState((current) =>
        current.status === "ready" && current.provider === "supabase"
          ? {
              ...current,
              proposals: current.proposals.map((item) =>
                item.id === result.proposal.id ? result.proposal : item,
              ),
              blocks: current.blocks.some((item) => item.id === result.block.id)
                ? current.blocks.map((item) =>
                    item.id === result.block.id ? result.block : item,
                  )
                : [result.block, ...current.blocks],
            }
          : current,
      );
      setGoogleConnectionState((current) =>
        current.status === "ready"
          ? { ...current, firstWriteWarningAcknowledged: true }
          : current,
      );
      setAcknowledgeFirstWriteWarning(false);
      setActionState({
        status: "saved",
        label: "Google Calendar event created through",
        provider: result.provider,
      });
    } catch (error) {
      setActionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create Google Calendar event.",
      });
    }
  }

  const persistedTasks = usesPersistedPlanning ? planningState.tasks : [];
  const proposals = (
    usesPersistedPlanning ? planningState.proposals : state.timeBlockProposals
  ).filter((proposal) => {
    if (usesPersistedPlanning || !selectedAreaId) return true;
    return proposal.area_id === selectedAreaId;
  });
  const blocks = (
    usesPersistedPlanning ? planningState.blocks : state.calendarBlocks
  ).filter((block) => {
    if (usesPersistedPlanning || !selectedAreaId) return true;
    return block.area_id === selectedAreaId;
  });
  const hasAny = persistedTasks.length > 0 || proposals.length > 0 || blocks.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Calendar / Planning</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          This view keeps local time-block proposals as the source of truth.
          Google Calendar conflict checks are optional and advisory only when a
          server-side connection exists. Accepting a proposal still creates a local
          scheduled block only.
        </p>
      </section>

      {planningState.status === "loading" ? (
        <p role="status">Loading planning context...</p>
      ) : null}

      {planningState.status === "ready" ? (
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}>
          Data source: <strong>{planningState.provider}</strong>
        </p>
      ) : null}

      {planningState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Planning rows could not load</h2>
          <p>{planningState.message}</p>
        </section>
      ) : null}

      {googleConnectionState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Google Calendar status could not load</h2>
          <p>{googleConnectionState.message}</p>
        </section>
      ) : null}

      {actionState.status === "saving" ? (
        <p role="status">Saving {actionState.label}...</p>
      ) : null}

      {actionState.status === "saved" ? (
        <section
          role="status"
          style={{
            border: "1px solid #86efac",
            background: "#f0fdf4",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          {actionState.label} <strong>{actionState.provider}</strong>.
        </section>
      ) : null}

      {actionState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Planning change was not saved</h2>
          <p>{actionState.message}</p>
        </section>
      ) : null}

      {!hasAny ? (
        <EmptyState
          title="No time-block proposals yet."
          description="When you propose time for tasks, local blocks appear here first. Google Calendar conflict checks are optional and do not create events."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {usesPersistedPlanning ? (
            <section
              style={{
                borderRadius: "0.75rem",
                border: "1px solid #e5e7eb",
                padding: "0.75rem 1rem",
              }}
            >
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
                Tasks ready to schedule
              </h2>
              {persistedTasks.length === 0 ? (
                <EmptyState
                  title="No persisted active tasks."
                  description="Accept task drafts in triage before proposing local time."
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    marginTop: "0.5rem",
                  }}
                >
                  {persistedTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "0.75rem",
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.85rem",
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{task.title}</div>
                        <div style={{ color: "#6b7280" }}>
                          Estimate: {task.estimated_minutes_low ?? "?"}-
                          {task.estimated_minutes_high ?? "?"} min
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleCreateProposal(task)}
                        disabled={actionState.status === "saving"}
                      >
                        Propose time
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section
            style={{
              borderRadius: "0.75rem",
              border: "1px solid #e5e7eb",
              padding: "0.75rem 1rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              Proposals (local only)
            </h2>
            {proposals.length === 0 ? (
              <EmptyState
                title="No proposals."
                description="Propose time from an active task to stage a local block."
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                {proposals.map((proposal) => {
                  const area = usesPersistedPlanning
                    ? null
                    : getAreaById(proposal.area_id);
                  const conflictSummary = proposalConflictSummary(proposal);
                  const task = usesPersistedPlanning
                    ? persistedTasks.find((item) => item.id === proposal.task_id)
                    : state.tasks.find((item) => item.id === proposal.task_id);
                  const googleBlock = usesPersistedPlanning
                    ? blocks.find(
                        (item) =>
                          item.proposal_id === proposal.id &&
                          item.google_event_id,
                      )
                    : null;
                  const googleWriteAllowed =
                    usesPersistedPlanning &&
                    googleConnectionState.status === "ready" &&
                    googleConnectionState.connected &&
                    !googleBlock &&
                    (googleConnectionState.firstWriteWarningAcknowledged ||
                      acknowledgeFirstWriteWarning) &&
                    (proposal.status === "proposed" ||
                      proposal.status === "edited" ||
                      proposal.status === "accepted");
                  const editedStart = new Date(proposal.proposed_start);
                  editedStart.setMinutes(editedStart.getMinutes() + 30);
                  const editedEnd = new Date(proposal.proposed_end);
                  editedEnd.setMinutes(editedEnd.getMinutes() + 30);

                  return (
                    <div
                      key={proposal.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "0.75rem",
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.85rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>
                        {task?.title ?? "Unassigned block"}
                      </div>
                      <div style={{ color: "#6b7280" }}>
                        {new Date(proposal.proposed_start).toLocaleTimeString()} -{" "}
                        {new Date(proposal.proposed_end).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <div style={{ color: "#6b7280" }}>Area: {area.name}</div>
                      ) : null}
                      <div style={{ color: "#4b5563" }}>
                        {proposalRationale(proposal)}
                      </div>
                      {usesPersistedPlanning &&
                      googleConnectionState.status === "ready" &&
                      googleConnectionState.connected &&
                      !googleConnectionState.firstWriteWarningAcknowledged ? (
                        <label
                          style={{
                            display: "flex",
                            gap: "0.5rem",
                            alignItems: "flex-start",
                            color: "#92400e",
                            background: "#fffbeb",
                            border: "1px solid #fcd34d",
                            borderRadius: "8px",
                            padding: "0.5rem",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={acknowledgeFirstWriteWarning}
                            onChange={(event) =>
                              setAcknowledgeFirstWriteWarning(
                                event.currentTarget.checked,
                              )
                            }
                          />
                          <span>
                            I understand this creates an event in Google Calendar.
                            If the write fails, the local proposal stays unchanged.
                          </span>
                        </label>
                      ) : null}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.25rem",
                        }}
                      >
                        <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                          Status: {proposal.status}
                        </span>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: conflictSummary.color,
                            backgroundColor: conflictSummary.backgroundColor,
                            borderRadius: "999px",
                            padding: "0.05rem 0.5rem",
                          }}
                        >
                          {conflictSummary.label}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <Button
                          type="button"
                          onClick={() => void handleCheckConflict(proposal.id)}
                          disabled={
                            !usesPersistedPlanning ||
                            actionState.status === "saving" ||
                            (proposal.status !== "proposed" &&
                              proposal.status !== "edited")
                          }
                        >
                          Check conflict
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleCreateGoogleEvent(proposal.id)}
                          disabled={
                            actionState.status === "saving" ||
                            !googleWriteAllowed
                          }
                        >
                          {googleBlock
                            ? "Google event created"
                            : "Create Google Calendar event"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            usesPersistedPlanning
                              ? void handleAcceptProposal(proposal.id)
                              : acceptLocalProposal(proposal.id)
                          }
                          disabled={
                            actionState.status === "saving" ||
                            proposal.status === "accepted"
                          }
                        >
                          Accept local block
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            usesPersistedPlanning
                              ? void handleEditProposal(proposal as TimeBlockProposal)
                              : editLocalProposal(proposal.id, {
                                  proposed_start: editedStart.toISOString(),
                                  proposed_end: editedEnd.toISOString(),
                                  rationale: `${proposalRationale(
                                    proposal,
                                  )} Edited locally by 30 minutes.`,
                                })
                          }
                          disabled={
                            actionState.status === "saving" ||
                            proposal.status === "accepted" ||
                            proposal.status === "rejected"
                          }
                        >
                          Edit +30 min
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            usesPersistedPlanning
                              ? void handleRejectProposal(proposal.id)
                              : rejectLocalProposal(proposal.id)
                          }
                          disabled={
                            actionState.status === "saving" ||
                            proposal.status === "accepted" ||
                            proposal.status === "rejected"
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            style={{
              borderRadius: "0.75rem",
              border: "1px solid #e5e7eb",
              padding: "0.75rem 1rem",
            }}
          >
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              Scheduled blocks (local)
            </h2>
            {blocks.length === 0 ? (
              <EmptyState
                title="No scheduled blocks."
                description="Blocks appear here after local proposal acceptance."
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                {blocks.map((block) => {
                  const area = usesPersistedPlanning
                    ? null
                    : getAreaById(block.area_id);
                  const task = usesPersistedPlanning
                    ? persistedTasks.find((item) => item.id === block.task_id)
                    : state.tasks.find((item) => item.id === block.task_id);

                  return (
                    <div
                      key={block.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: "0.75rem",
                        padding: "0.5rem 0.75rem",
                        fontSize: "0.85rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>
                        {task?.title ?? "Block without specific task"}
                      </div>
                      <div style={{ color: "#6b7280" }}>
                        {new Date(block.start_at).toLocaleTimeString()} -{" "}
                        {new Date(block.end_at).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <div style={{ color: "#6b7280" }}>Area: {area.name}</div>
                      ) : null}
                      <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                        Status: {block.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <section style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>
        <p style={{ margin: 0 }}>
          Time proposals stay local first. Free/busy checks are manual and advisory
          only. No Google Calendar events, OpenAI scheduling, autonomous
          rescheduling, or background calendar changes happen here.
        </p>
      </section>
    </div>
  );
}
