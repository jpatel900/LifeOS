"use client";

import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function TriagePage() {
  const { state, acceptTaskDraft, rejectTaskDraft, editTaskDraft } = useWorkflow();
  const triageCandidates = state.taskDrafts.filter((draft) => draft.status === "pending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Triage</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Review uncertain items before they enter your real task list. Accepting a
          draft creates a local task and a proposed time block.
        </p>
      </section>

      {triageCandidates.length === 0 ? (
        <EmptyState
          title="Nothing to triage right now."
          description="When AI parsing is added, low-confidence drafts will appear here for review."
        />
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {triageCandidates.map((task) => {
            const area = getAreaById(task.area_id);
            const assessment = state.ambiguityAssessments.find(
              (item) => item.source_capture_item_id === task.capture_item_id,
            );
            return (
              <div
                key={task.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    alignItems: "baseline",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.95rem",
                        fontWeight: 500,
                        marginBottom: 4,
                      }}
                    >
                      {task.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#6b7280",
                        display: "flex",
                        gap: "0.75rem",
                      }}
                    >
                      <span>Classification: task draft (mock)</span>
                      {area ? <span>Area suggestion: {area.name}</span> : null}
                      <span>Confidence: {Math.round(task.confidence * 100)}%</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#b45309",
                      backgroundColor: "#fffbeb",
                      borderRadius: "999px",
                      padding: "0.1rem 0.6rem",
                    }}
                  >
                    Needs triage
                  </span>
                </div>
                {assessment ? (
                  <div
                    style={{
                      borderRadius: "0.75rem",
                      backgroundColor: "#f9fafb",
                      padding: "0.5rem 0.75rem",
                      fontSize: "0.85rem",
                      color: "#4b5563",
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>Ambiguity assessment</div>
                    <div>First useful move: {assessment.recommended_first_move}</div>
                    <div>Unknowns: {assessment.unknowns.join(", ")}</div>
                    <div>
                      What not to do yet: {assessment.what_not_to_do_yet.join(", ")}
                    </div>
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    marginTop: "0.25rem",
                  }}
                >
                  <Button
                    type="button"
                    onClick={() => acceptTaskDraft(task.id)}
                    aria-label="Accept draft"
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      editTaskDraft(task.id, {
                        title: `${task.title} (edited)`,
                        description: task.description,
                      })
                    }
                    aria-label="Edit draft"
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    onClick={() => rejectTaskDraft(task.id)}
                    aria-label="Reject draft"
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      editTaskDraft(task.id, {
                        title: task.title,
                        description: `${task.description ?? ""}\nDeferred locally.`,
                      })
                    }
                    aria-label="Defer draft"
                  >
                    Defer
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      editTaskDraft(task.id, {
                        title: task.title,
                        description: `${task.description ?? ""}\nArea reassignment will be added when real area editing is available.`,
                      })
                    }
                    aria-label="Reassign area"
                  >
                    Reassign area
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

