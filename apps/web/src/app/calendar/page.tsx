"use client";

import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function CalendarPage() {
  const {
    state,
    selectedAreaId,
    acceptLocalProposal,
    rejectLocalProposal,
    editLocalProposal,
  } = useWorkflow();

  const proposals = state.timeBlockProposals.filter((proposal) => {
    if (!selectedAreaId) return true;
    return proposal.area_id === selectedAreaId;
  });
  const blocks = state.calendarBlocks.filter((block) => {
    if (!selectedAreaId) return true;
    return block.area_id === selectedAreaId;
  });

  const hasAny = proposals.length > 0 || blocks.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Calendar / Planning</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          This view shows local time-block proposals and app-owned blocks only. No
          external calendar integration is active in this mock shell. Accepting a proposal
          creates a local scheduled block only.
        </p>
      </section>

      {!hasAny ? (
        <EmptyState
          title="No time-block proposals yet."
          description="When you propose time for tasks, local-only blocks will appear here. External calendars are not connected in Phase 1."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          <div
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
                description="Ask the app to propose time for tasks later; for now this is empty mock data."
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
                {proposals.map((p) => {
                  const area = getAreaById(p.area_id);
                  const task = state.tasks.find((item) => item.id === p.task_id);
                  const editedStart = new Date(p.proposed_start);
                  editedStart.setMinutes(editedStart.getMinutes() + 30);
                  const editedEnd = new Date(p.proposed_end);
                  editedEnd.setMinutes(editedEnd.getMinutes() + 30);
                  return (
                    <div
                      key={p.id}
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
                        {new Date(p.proposed_start).toLocaleTimeString()} –{" "}
                        {new Date(p.proposed_end).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <div style={{ color: "#6b7280" }}>Area: {area.name}</div>
                      ) : null}
                      <div style={{ color: "#4b5563" }}>{p.rationale}</div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.25rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.7rem",
                            color: "#6b7280",
                          }}
                        >
                          Status: {p.status}
                        </span>
                      {p.conflict_flag ? (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#b91c1c",
                              backgroundColor: "#fee2e2",
                              borderRadius: "999px",
                              padding: "0.05rem 0.5rem",
                            }}
                          >
                            Conflict flagged (mock)
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "#166534",
                              backgroundColor: "#dcfce7",
                              borderRadius: "999px",
                              padding: "0.05rem 0.5rem",
                            }}
                          >
                            No conflict detected (mock)
                          </span>
                        )}
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
                          onClick={() => acceptLocalProposal(p.id)}
                          disabled={p.status === "accepted"}
                        >
                          Accept local block
                        </Button>
                        <Button
                          type="button"
                          onClick={() =>
                            editLocalProposal(p.id, {
                              proposed_start: editedStart.toISOString(),
                              proposed_end: editedEnd.toISOString(),
                              rationale: `${p.rationale} Edited locally by 30 minutes.`,
                            })
                          }
                          disabled={p.status === "accepted" || p.status === "rejected"}
                        >
                          Edit +30 min
                        </Button>
                        <Button
                          type="button"
                          onClick={() => rejectLocalProposal(p.id)}
                          disabled={p.status === "accepted" || p.status === "rejected"}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
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
                description="Blocks will appear here after approval in future iterations. This is mock local data only."
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
                {blocks.map((b) => {
                  const area = getAreaById(b.area_id);
                  const task = state.tasks.find((item) => item.id === b.task_id);
                  return (
                    <div
                      key={b.id}
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
                        {new Date(b.start_at).toLocaleTimeString()} –{" "}
                        {new Date(b.end_at).toLocaleTimeString()}
                      </div>
                      {area ? (
                        <div style={{ color: "#6b7280" }}>Area: {area.name}</div>
                      ) : null}
                      <span
                        style={{
                          fontSize: "0.7rem",
                          color: "#6b7280",
                        }}
                      >
                        Status: {b.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <section style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#6b7280" }}>
        <p style={{ margin: 0 }}>
          This is a mock planning view. All proposals and blocks are stored only in
          local mock data; no Google Calendar or other external APIs are called.
        </p>
      </section>
    </div>
  );
}

