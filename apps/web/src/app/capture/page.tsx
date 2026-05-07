"use client";

import { useState } from "react";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { getAreaById } from "@/lib/mockData";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function CapturePage() {
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText,
  } = useWorkflow();
  const [text, setText] = useState("");

  const handleStructure = () => {
    if (!text.trim()) {
      return;
    }
    submitCaptureText(text, selectedAreaId);
    setText("");
  };

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
          Paste or type anything on your mind. In this mock shell, structuring is
          local only and does not call any AI.
        </p>
      </section>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          maxWidth: "720px",
        }}
      >
        <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>
          Raw capture
        </label>
        <textarea
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>Area</span>
            <select
              value={selectedAreaId ?? ""}
              onChange={(e) => setSelectedAreaId(e.target.value || null)}
              style={{
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                padding: "0.15rem 0.5rem",
                fontSize: "0.8rem",
                backgroundColor: "white",
              }}
            >
              {state.areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" onClick={handleStructure}>
            Structure
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

      <section style={{ marginTop: "1rem" }}>
        <h2>Recent captures</h2>
        {visibleCaptures.length === 0 ? (
          <EmptyState
            title="Nothing captured yet for this area."
            description="Enter messy text above to create a raw capture, draft task, ambiguity assessment, first action, and possible local block."
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
                      style={{ fontSize: "0.95rem", fontWeight: 500, marginBottom: 4 }}
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
                    Raw kept locally
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

