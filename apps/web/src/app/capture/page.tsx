"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Area, CaptureItem, ParseCaptureResponse } from "@lifeos/schemas";
import { Button } from "@lifeos/ui";
import { EmptyState } from "../components/EmptyState";
import { buildParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";
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
  "side-project": "area-side-project",
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

type ParseState =
  | { status: "idle" }
  | { status: "parsing"; parserMode: "auto" | "mock" }
  | {
      status: "parsed";
      parser: "ai" | "mock";
      draftCount: number;
      triageRequired: boolean;
      lowConfidence: boolean;
    }
  | { status: "error"; message: string; canRetryWithMock: boolean };

type ParserStatusState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      parserStatus: "mock" | "ai_configured" | "ai_unavailable";
      preferredParser: "ai" | "mock";
    };

type ParseCaptureApiResponse =
  | {
      ok: true;
      parser: "ai" | "mock";
      response: ParseCaptureResponse;
      status: "mock" | "ai_configured" | "ai_unavailable";
    }
  | {
      ok: false;
      error: string;
      can_retry_with_mock?: boolean;
      status?: "mock" | "ai_configured" | "ai_unavailable";
    };

type ParseCaptureStatusApiResponse =
  | {
      ok: true;
      status: "mock" | "ai_configured" | "ai_unavailable";
      preferredParser: "ai" | "mock";
    }
  | { ok: false; error: string };

export default function CapturePage() {
  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText,
    addParsedWorkflowResult,
  } = useWorkflow();

  const [areasState, setAreasState] = useState<AreasState>({
    status: "loading",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const [parserStatusState, setParserStatusState] = useState<ParserStatusState>(
    {
      status: "loading",
    },
  );
  const [text, setText] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [lastSavedCapture, setLastSavedCapture] = useState<CaptureItem | null>(
    null,
  );

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

  useEffect(() => {
    let cancelled = false;

    async function loadParserStatus() {
      try {
        const result = await fetch("/api/parse-capture");
        const body = (await result.json()) as ParseCaptureStatusApiResponse;
        if (!result.ok || !body.ok) {
          throw new Error("Parser status unavailable.");
        }

        if (!cancelled) {
          setParserStatusState({
            status: "ready",
            parserStatus: body.status,
            preferredParser: body.preferredParser,
          });
        }
      } catch {
        if (!cancelled) {
          setParserStatusState({ status: "error" });
        }
      }
    }

    void loadParserStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleAreaChange(nextAreaId: string) {
    const idOrEmpty = nextAreaId || null;
    setAreaId(idOrEmpty);
    const area =
      areasState.status === "ready"
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

  const areas = areasState.status === "ready" ? areasState.areas : [];
  const provider = areasState.status === "ready" ? areasState.provider : null;

  async function parseCaptureForSavedCapture(
    savedCapture: CaptureItem,
    parserMode: "auto" | "mock",
  ) {
    const parseResult = await fetch("/api/parse-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: savedCapture.raw_text,
        parserMode,
        areaContext: areas.map((area) => ({
          slug: area.slug,
          name: area.name,
        })),
      }),
    });
    const body = (await parseResult.json()) as ParseCaptureApiResponse;
    if (!parseResult.ok || !body.ok) {
      setParseState({
        status: "error",
        message:
          "Capture was saved, but parsing failed safely. Retry with mock parser.",
        canRetryWithMock: Boolean(!body.ok && body.can_retry_with_mock),
      });
      return;
    }

    const workflowResult = buildParsedWorkflowResult({
      response: body.response,
      capture: savedCapture,
      workflowAreaId: selectedAreaId,
    });
    addParsedWorkflowResult(workflowResult);
    setParseState({
      status: "parsed",
      parser: body.parser,
      draftCount:
        workflowResult.taskDrafts.length + workflowResult.projectDrafts.length,
      triageRequired: workflowResult.captureItem.status === "triage_required",
      lowConfidence: body.response.parse_status === "low_confidence",
    });
  }

  async function handleSaveAndParse() {
    setParseState({ status: "parsing", parserMode: "auto" });

    try {
      const captureResult = await createCaptureItem(
        createSupabaseBrowserClient(),
        {
          raw_text: text,
          area_id: areaId,
        },
      );
      setLastSavedCapture(captureResult.capture);
      setSaveState({
        status: "saved",
        provider: captureResult.provider,
        capture: captureResult.capture,
      });

      await parseCaptureForSavedCapture(captureResult.capture, "auto");
    } catch {
      setParseState({
        status: "error",
        message: "Capture save or parse failed safely. Please retry.",
        canRetryWithMock: false,
      });
    }
  }

  async function handleRetryWithMockParser() {
    if (!lastSavedCapture) {
      return;
    }

    setParseState({ status: "parsing", parserMode: "mock" });
    await parseCaptureForSavedCapture(lastSavedCapture, "mock");
  }

  function handleStructure() {
    if (!text.trim()) {
      return;
    }
    submitCaptureText(text, selectedAreaId);
  }

  const parserStatusLabel =
    parserStatusState.status === "ready"
      ? parserStatusState.parserStatus === "ai_configured"
        ? "AI parser configured"
        : parserStatusState.parserStatus === "ai_unavailable"
          ? "AI parser unavailable"
          : "Mock parser"
      : parserStatusState.status === "loading"
        ? "Checking parser status..."
        : "Parser status unavailable";
  const parserStatusDetail =
    parserStatusState.status === "ready"
      ? parserStatusState.parserStatus === "ai_configured"
        ? "Save and parse will use AI by default."
        : parserStatusState.parserStatus === "ai_unavailable"
          ? "Save and parse will use the mock parser safely."
          : "AI parsing is disabled. Save and parse will use the mock parser."
      : "Capture can still be saved and structured with the local mock parser.";

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
        <p
          style={{
            marginTop: "0.25rem",
            color: "#4b5563",
            fontSize: "0.95rem",
          }}
        >
          Save raw text through the data layer, then optionally parse it into
          reviewable task/project drafts. The Phase 2 mock parser remains
          available.
        </p>
      </section>

      <section
        role="status"
        style={{
          border: "1px solid #d1d5db",
          background: "#f9fafb",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          maxWidth: "720px",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
          Parser status: {parserStatusLabel}
        </div>
        <div style={{ fontSize: "0.9rem", color: "#4b5563" }}>
          {parserStatusDetail}
        </div>
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
        <label
          htmlFor="raw_capture"
          style={{ fontSize: "0.9rem", fontWeight: 500 }}
        >
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
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
            Persist raw capture (Phase 4A)
          </h2>
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
              No active areas are available yet. You can still save an unscoped
              capture.
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
          <button
            type="button"
            onClick={() => void handleSaveAndParse()}
            disabled={parseState.status === "parsing"}
            style={{
              padding: "0.75rem 1.25rem",
              fontSize: "1rem",
              borderRadius: "8px",
              border: "1px solid #111827",
              background: "white",
              color: "#111827",
              cursor: parseState.status === "parsing" ? "wait" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {parseState.status === "parsing"
              ? parseState.parserMode === "mock"
                ? "Retrying with mock parser..."
                : "Saving and parsing..."
              : "Save and parse"}
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
            Phase 2 mock uses the area picker in the header (synced from your
            saved-area slug when possible).
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
            <div>
              First suggested action: {latestAssessment.recommended_first_move}
            </div>
            <div>
              Possible local block:{" "}
              {new Date(
                latestProposalDraft.proposed_start,
              ).toLocaleTimeString()}{" "}
              –{" "}
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

      {parseState.status === "parsed" ? (
        <section
          role="status"
          style={{
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Capture parsed</h2>
          <p>
            Parser: <strong>{parseState.parser}</strong>. Drafts routed to
            triage: <strong>{parseState.draftCount}</strong>.
          </p>
          {parseState.triageRequired ? (
            <p style={{ marginBottom: 0 }}>
              {parseState.lowConfidence
                ? "Drafts were routed to triage because confidence is low."
                : "Drafts were routed to triage for review before acceptance."}
            </p>
          ) : (
            <p style={{ marginBottom: 0 }}>
              Capture is parseable and drafts are still reviewable in triage
              before acceptance.
            </p>
          )}
        </section>
      ) : null}

      {parseState.status === "error" ? (
        <section
          role="alert"
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            borderRadius: "8px",
            padding: "1rem",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Capture parse failed safely</h2>
          <p>{parseState.message}</p>
          {parseState.canRetryWithMock && lastSavedCapture ? (
            <button
              type="button"
              onClick={() => void handleRetryWithMockParser()}
              style={{
                padding: "0.5rem 0.9rem",
                fontSize: "0.9rem",
                borderRadius: "8px",
                border: "1px solid #991b1b",
                background: "white",
                color: "#991b1b",
                cursor: "pointer",
              }}
            >
              Retry with mock parser
            </button>
          ) : null}
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
