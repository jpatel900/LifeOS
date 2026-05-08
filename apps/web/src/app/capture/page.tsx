"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Area, CaptureItem } from "@lifeos/schemas";
import { AppShell } from "../../components/AppShell";
import {
  createCaptureItem,
  listAreas,
  type DataProvider,
} from "../../lib/data/workflow";
import { createSupabaseBrowserClient } from "../../lib/supabase/browser";

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
  const [areasState, setAreasState] = useState<AreasState>({
    status: "loading",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [rawText, setRawText] = useState("");
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
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState({ status: "saving" });

    try {
      const result = await createCaptureItem(createSupabaseBrowserClient(), {
        raw_text: rawText,
        area_id: areaId,
      });

      setSaveState({
        status: "saved",
        provider: result.provider,
        capture: result.capture,
      });
      setRawText("");
    } catch (error) {
      setSaveState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Unable to save capture.",
      });
    }
  }

  const areas = areasState.status === "ready" ? areasState.areas : [];
  const provider = areasState.status === "ready" ? areasState.provider : null;

  return (
    <AppShell>
      <h1>Capture</h1>
      <p>
        Save raw text before any future AI parsing. This keeps the original
        capture intact even if later processing fails.
      </p>

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
            marginBottom: "1rem",
          }}
        >
          <h2>Capture context could not load</h2>
          <p>{areasState.message}</p>
        </section>
      ) : null}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        {provider ? (
          <p>
            Data source: <strong>{provider}</strong>
          </p>
        ) : null}

        <label htmlFor="area">Area</label>
        <select
          id="area"
          value={areaId ?? ""}
          onChange={(event) => setAreaId(event.target.value || null)}
          disabled={saveState.status === "saving"}
          style={{ padding: "0.75rem", borderRadius: "8px" }}
        >
          <option value="">No area yet</option>
          {areas.map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>

        {areasState.status === "ready" && areas.length === 0 ? (
          <p>No active areas are available yet. You can still save an unscoped capture.</p>
        ) : null}

        <label htmlFor="raw_text">Raw capture</label>
        <textarea
          id="raw_text"
          placeholder="What's on your mind? Type anything..."
          rows={5}
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          disabled={saveState.status === "saving"}
          style={{
            padding: "0.75rem",
            fontSize: "1rem",
            borderRadius: "8px",
            border: "1px solid #ccc",
            resize: "vertical",
          }}
        />

        <button
          type="submit"
          disabled={saveState.status === "saving"}
          style={{
            padding: "0.75rem 1.5rem",
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

      {saveState.status === "saved" ? (
        <section
          role="status"
          style={{
            border: "1px solid #86efac",
            background: "#f0fdf4",
            borderRadius: "8px",
            padding: "1rem",
            marginTop: "1rem",
          }}
        >
          <h2>Capture saved</h2>
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
            marginTop: "1rem",
          }}
        >
          <h2>Capture was not saved</h2>
          <p>{saveState.message}</p>
        </section>
      ) : null}
    </AppShell>
  );
}
