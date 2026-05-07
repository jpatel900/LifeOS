"use client";

import { Button } from "@lifeos/ui";
import { EmptyState } from "../../components/EmptyState";
import { useWorkflow } from "@/lib/WorkflowContext";

export default function AreasSettingsPage() {
  const { state, resetWorkflow } = useWorkflow();
  const localAreas = state.areas;

  if (localAreas.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <section>
          <h1>Areas</h1>
          <p
            style={{
              marginTop: "0.25rem",
              color: "#4b5563",
              fontSize: "0.95rem",
            }}
          >
            Configure life areas. In this mock view, areas are read-only examples seeded
            from local data.
          </p>
        </section>
        <EmptyState
          title="No areas defined."
          description="In a real setup, default areas like Main Job, Personal, and Volunteer Work would be created automatically."
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h1>Areas</h1>
        <p style={{ marginTop: "0.25rem", color: "#4b5563", fontSize: "0.95rem" }}>
          Seeded mock areas only. Create/edit/archive controls are present but do not
          persist changes yet.
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
        {localAreas.map((area) => (
          <div
            key={area.id}
            style={{
              borderRadius: "0.75rem",
              border: "1px solid #e5e7eb",
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{area.name}</div>
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                Mock color: {area.color ?? "none"}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button
                type="button"
                onClick={() => {
                  console.log("Edit area (mock)", area.id);
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                onClick={() => {
                  console.log("Archive area (mock)", area.id);
                }}
              >
                Archive
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section style={{ marginTop: "0.5rem" }}>
        <Button
          type="button"
          onClick={() => {
            console.log("Create new area (mock)");
          }}
        >
          New area (mock only)
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={resetWorkflow}
          style={{ marginLeft: "0.5rem" }}
        >
          Reset local mock flow
        </Button>
      </section>
    </div>
  );
}

