"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Area, CaptureItem } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import {
  createCaptureItem,
  listAreas,
  type DataProvider,
} from "@/lib/data/workflow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";

/** Map Phase 4A seed area slugs to Phase 2 mock workflow area ids (mockData). */
const WORKFLOW_AREA_BY_SLUG: Record<string, string> = {
  "main-job": "area-main-job",
  personal: "area-personal",
  "volunteer-work": "area-volunteer",
};

type AreasState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; provider: DataProvider; capture: CaptureItem }
  | { status: "error"; message: string };

export default function CapturePage() {
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText,
  } = useWorkflow();

  const [areasState, setAreasState] = useState<AreasState>({
    status: "loading",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [text, setText] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAreas() {
      try {
        const result = await listAreas(createSupabaseBrowserClient());

        if (!cancelled) {
          setAreasState({
            status: "ready",
            provider: result.provider,
            areas: result.areas,
          });
          const first = result.areas[0];
          if (first) {
            setAreaId(first.id);
            const wf = WORKFLOW_AREA_BY_SLUG[first.slug];
            if (wf) setSelectedAreaId(wf);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAreasState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load areas for capture.",
          });
        }
      }
    }

    void loadAreas();

    return () => {
      cancelled = true;
    };
  }, [setSelectedAreaId]);

  function handleAreaChange(nextAreaId: string) {
    const idOrEmpty = nextAreaId || null;
    setAreaId(idOrEmpty);
    const area = areasState.status === "ready"
      ? areasState.areas.find((a) => a.id === idOrEmpty)
      : undefined;
    if (area) {
      const wf = WORKFLOW_AREA_BY_SLUG[area.slug];
      if (wf) setSelectedAreaId(wf);
    }
  }

  async function handleSaveCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState({ status: "saving" });

    try {
      const result = await createCaptureItem(createSupabaseBrowserClient(), {
        raw_text: text,
        area_id: areaId,
      });

      setSaveState({
        status: "saved",
        provider: result.provider,
        capture: result.capture,
      });
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to save capture.",
      });
    }
  }

  function handleStructure() {
    if (!text.trim()) {
      return;
    }
    submitCaptureText(text, selectedAreaId);
  }

  const areas = areasState.status === "ready" ? areasState.areas : [];
  const provider = areasState.status === "ready" ? areasState.provider : null;

  const visibleCaptures = state.captureItems.filter((capture) => {
    if (!selectedAreaId) return true;
    return capture.area_id === selectedAreaId;
  });

  const latestAssessment = state.ambiguityAssessments[0];
  const latestDraft = state.taskDrafts[0];
  const latestProposalDraft = state.timeBlockProposalDrafts[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Capture</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Save raw text through the data layer (Phase 4A), then optionally run the Phase 2
          mock parser for drafts and triage — local session only, no external AI.
        </p>
      </section>

      {areasState.status === "loading" ? (
        <p role="status">Loading capture context...</p>
      ) : null}

      {areasState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2>Capture context could not load</h2>
          <p>{areasState.message}</p>
        </section>
      ) : null}

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxWidth: "720px",
        }}
      >
        <label htmlFor="raw_capture" style={{ fontSize: "0.9rem", fontWeight: 500 }}>
          Raw capture
        </label>
        <textarea
          id="raw_capture"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="What's on your mind? Type anything..."
          style={{
            padding: "0.75rem",
            fontSize: "1rem",
            borderRadius: "0.75rem",
            border: "1px solid #d1d5db",
            resize: "vertical",
          }}
        />

        <form
          onSubmit={handleSaveCapture}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            padding: "1rem",
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Persist raw capture (Phase 4A)</h2>
          {provider ? (
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#4b5563" }}>
              Data source: <strong>{provider}</strong>
            </p>
          ) : null}

          <label htmlFor="area_persist">Area for saved row</label>
          <select
            id="area_persist"
            value={areaId ?? ""}
            onChange={(e) => handleAreaChange(e.target.value)}
            disabled={saveState.status === "saving"}
            style={{
              borderRadius: "999px",
              border: "1px solid #d1d5db",
              padding: "0.35rem 0.75rem",
              fontSize: "0.9rem",
              backgroundColor: "white",
            }}
          >
            <option value="">No area yet</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

          {areasState.status === "ready" && areas.length === 0 ? (
            <p style={{ fontSize: "0.9rem" }}>
              No active areas are available yet. You can still save an unscoped capture.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saveState.status === "saving"}
            style={{
              padding: "0.75rem 1.25rem",
              fontSize: "1rem",
              borderRadius: "8px",
              border: "none",
              background: "#0070f3",
              color: "white",
              cursor: saveState.status === "saving" ? "wait" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {saveState.status === "saving" ? "Saving..." : "Save capture"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
            Phase 2 mock uses the area picker in the header (synced from your saved-area slug
            when possible).
          </div>
          <Button type="button" onClick={handleStructure}>
            Structure locally (Phase 2 mock)
          </Button>
        </div>

        {latestDraft && latestAssessment && latestProposalDraft ? (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem 1rem",
              borderRadius: "0.75rem",
              backgroundColor: "#ecfeff",
              border: "1px solid #67e8f9",
              fontSize: "0.9rem",
              color: "#0f766e",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Mock parser created a draft bundle.
            </div>
            <div>Task draft: {latestDraft.title}</div>
            <div>First suggested action: {latestAssessment.recommended_first_move}</div>
            <div>
              Possible local block:{" "}
              {new Date(latestProposalDraft.proposed_start).toLocaleTimeString()} –{" "}
              {new Date(latestProposalDraft.proposed_end).toLocaleTimeString()}
            </div>
          </div>
        ) : null}
      </section>

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
          <h2 style={{ marginTop: 0 }}>Capture saved</h2>
          <p>
            Stored through <strong>{saveState.provider}</strong> with status{" "}
            <strong>{saveState.capture.status}</strong>.
          </p>
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
          <h2 style={{ marginTop: 0 }}>Capture was not saved</h2>
          <p>{saveState.message}</p>
        </section>
      ) : null}

      <section style={{ marginTop: "1rem" }}>
        <h2>Recent captures (Phase 2 mock session)</h2>
        {visibleCaptures.length === 0 ? (
          <EmptyState
            title="Nothing captured yet for this mock area."
            description="Use Structure locally to create raw capture, draft task, ambiguity assessment, and possible local block in session state."
          />
        ) : (
          <div
            style={{
              marginTop: "0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {visibleCaptures.map((capture) => {
              const area = getAreaById(capture.area_id);
              return (
                <div
                  key={capture.id}
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "0.75rem",
                    border: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
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
                      {capture.raw_text}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#6b7280",
                        display: "flex",
                        gap: "0.75rem",
                      }}
                    >
                      <span>Status: {capture.status}</span>
                      {area ? <span>Area: {area.name}</span> : null}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#6b7280",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Session-only
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
