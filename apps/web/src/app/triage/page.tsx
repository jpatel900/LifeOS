"use client";

import { useEffect, useState } from "react";
import type { Area } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import {
  createProject,
  createTask,
  listAreas,
  type DataProvider,
} from "@/lib/data/workflow";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";
import { slugForWorkflowAreaId } from "@/lib/workflowAreaMapping";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

type SaveState =
  | { status: "idle" }
  | { status: "saving"; label: string }
  | { status: "saved"; label: string; provider: DataProvider }
  | { status: "error"; message: string };

function resolvePersistedAreaId(workflowAreaId: string, areas: Area[]) {
  const slug = slugForWorkflowAreaId(workflowAreaId);
  const area = areas.find((item) => item.slug === slug) ?? areas[0];

  if (!area) {
    throw new Error("Create an active area before accepting triage drafts.");
  }

  return area.id;
}

function sourceCaptureIdForPersistence(captureItemId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    captureItemId,
  )
    ? captureItemId
    : null;
}

export default function TriagePage() {
  const {
    state,
    acceptTaskDraft,
    acceptProjectDraft,
    rejectTaskDraft,
    rejectProjectDraft,
    editTaskDraft,
  } = useWorkflow();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const triageCandidates = state.taskDrafts.filter(
    (draft) => draft.status === "pending",
  );
  const projectCandidates = state.projectDrafts.filter(
    (draft) => draft.status === "pending",
  );
  const totalCandidates = triageCandidates.length + projectCandidates.length;

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const result = await listAreas(createSupabaseBrowserClient());
        if (!cancelled) {
          setLoadState({
            status: "ready",
            provider: result.provider,
            areas: result.areas,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load triage persistence context.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAcceptTaskDraft(draftId: string) {
    const draft = state.taskDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    if (loadState.status !== "ready") {
      setSaveState({
        status: "error",
        message: "Triage data source is not ready.",
      });
      return;
    }

    setSaveState({ status: "saving", label: draft.title });
    try {
      const result = await createTask(createSupabaseBrowserClient(), {
        area_id: resolvePersistedAreaId(draft.area_id, loadState.areas),
        source_capture_item_id: sourceCaptureIdForPersistence(
          draft.capture_item_id,
        ),
        title: draft.title,
        description: draft.description,
        priority_confidence: draft.confidence,
        estimated_minutes_low: draft.estimated_minutes_low,
        estimated_minutes_high: draft.estimated_minutes_high,
        first_tiny_step: draft.first_tiny_step,
      });
      acceptTaskDraft(draftId);
      setSaveState({
        status: "saved",
        label: result.task.title,
        provider: result.provider,
      });
      void captureEvent({
        event: "triage_item_accepted",
        properties: {
          area_present: true,
          feature: "triage",
          item_type: "task",
          status: "accepted",
        },
      });
      void captureEvent({
        event: "task_created",
        properties: {
          area_present: true,
          feature: "triage",
          status: result.task.status,
        },
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to accept task draft.",
      });
    }
  }

  async function handleAcceptProjectDraft(draftId: string) {
    const draft = state.projectDrafts.find((item) => item.id === draftId);
    if (!draft) return;
    if (loadState.status !== "ready") {
      setSaveState({
        status: "error",
        message: "Triage data source is not ready.",
      });
      return;
    }

    setSaveState({ status: "saving", label: draft.title });
    try {
      const result = await createProject(createSupabaseBrowserClient(), {
        area_id: resolvePersistedAreaId(draft.area_id, loadState.areas),
        title: draft.title,
        description: draft.description,
      });
      acceptProjectDraft(draftId);
      setSaveState({
        status: "saved",
        label: result.project.title,
        provider: result.provider,
      });
      void captureEvent({
        event: "triage_item_accepted",
        properties: {
          area_present: true,
          feature: "triage",
          item_type: "project",
          status: "accepted",
        },
      });
      void captureEvent({
        event: "project_created",
        properties: {
          area_present: true,
          feature: "triage",
          status: result.project.status,
        },
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to accept project draft.",
      });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Triage</h1>
        <p
          style={{
            marginTop: "0.25rem",
            color: "#4b5563",
            fontSize: "0.95rem",
          }}
        >
          Drafts listed here are local session state from capture parsing.
          Accept writes persisted tasks/projects through the current data
          provider; reject, defer, and reassign actions stay local session
          changes.
        </p>
      </section>

      {loadState.status === "loading" ? (
        <p role="status">Loading triage context...</p>
      ) : null}

      {loadState.status === "ready" ? (
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}>
          Persisted acceptance provider: <strong>{loadState.provider}</strong>.
          Draft list source: <strong>local session</strong>.
        </p>
      ) : null}

      {loadState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Triage context could not load</h2>
          <p>{loadState.message}</p>
        </section>
      ) : null}

      {saveState.status === "saving" ? (
        <p role="status">Accepting {saveState.label}...</p>
      ) : null}

      {saveState.status === "saved" ? (
        <section
          role="status"
          style={{
            border: "1px solid #86efac",
            background: "#f0fdf4",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          Accepted {saveState.label} through{" "}
          <strong>{saveState.provider}</strong>.
        </section>
      ) : null}

      {saveState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Draft was not accepted</h2>
          <p>{saveState.message}</p>
        </section>
      ) : null}

      {totalCandidates === 0 ? (
        <EmptyState
          title="Nothing to triage right now."
          description="No pending local session drafts. Use Capture to save and parse, or Structure locally."
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
                      <span>Classification: task draft (local session)</span>
                      {area ? <span>Area suggestion: {area.name}</span> : null}
                      <span>
                        Confidence: {Math.round(task.confidence * 100)}%
                      </span>
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
                    <div>
                      First useful move: {assessment.recommended_first_move}
                    </div>
                    <div>Unknowns: {assessment.unknowns.join(", ")}</div>
                    <div>
                      What not to do yet:{" "}
                      {assessment.what_not_to_do_yet.join(", ")}
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
                    onClick={() => void handleAcceptTaskDraft(task.id)}
                    aria-label="Accept task draft"
                    disabled={saveState.status === "saving"}
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
                    aria-label="Reject task draft"
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
                        description: `${task.description ?? ""}\nLocal session area reassignment note added.`,
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
          {projectCandidates.map((project) => {
            const area = getAreaById(project.area_id);
            return (
              <div
                key={project.id}
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
                      {project.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#6b7280",
                        display: "flex",
                        gap: "0.75rem",
                      }}
                    >
                      <span>Classification: project draft (local session)</span>
                      {area ? <span>Area suggestion: {area.name}</span> : null}
                      <span>
                        Confidence: {Math.round(project.confidence * 100)}%
                      </span>
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
                {project.description ? (
                  <p
                    style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}
                  >
                    {project.description}
                  </p>
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
                    onClick={() => void handleAcceptProjectDraft(project.id)}
                    aria-label="Accept project draft"
                    disabled={saveState.status === "saving"}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    onClick={() => rejectProjectDraft(project.id)}
                    aria-label="Reject project draft"
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
  );
}
