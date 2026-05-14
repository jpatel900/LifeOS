"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Area, CaptureItem, ParseCaptureResponse } from "@lifeos/schemas";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "../components/EmptyState";
import { buildParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";
import { getAreaById } from "@/lib/mockData";
import {
  createCaptureItem,
  listAreas,
  type DataProvider,
} from "@/lib/data/workflow";
import { captureEvent } from "@/lib/observability";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useWorkflow } from "@/lib/WorkflowContext";
import { workflowAreaIdForSlug } from "@/lib/workflowAreaMapping";

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
            const wf = workflowAreaIdForSlug(first.slug);
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
      const wf = workflowAreaIdForSlug(area.slug);
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
      void captureEvent({
        event: "capture_submitted",
        properties: {
          area_present: Boolean(areaId),
          feature: "capture",
          status: result.capture.status,
        },
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
      void captureEvent({
        event: "parse_failed",
        properties: {
          area_present: Boolean(savedCapture.area_id),
          error_category: "parse_failed_safely",
          feature: "capture",
          provider: parserMode === "mock" ? "mock" : "unknown",
          used_mock: parserMode === "mock",
        },
      });
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
    void captureEvent({
      event: "parse_succeeded",
      properties: {
        area_present: Boolean(savedCapture.area_id),
        feature: "capture",
        prompt_version: body.response.prompt_version,
        provider: body.parser,
        schema_version: body.response.schema_version,
        status: body.response.parse_status,
        used_mock: body.parser === "mock",
      },
    });
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
      void captureEvent({
        event: "capture_submitted",
        properties: {
          area_present: Boolean(areaId),
          feature: "capture",
          status: captureResult.capture.status,
        },
      });

      await parseCaptureForSavedCapture(captureResult.capture, "auto");
    } catch {
      void captureEvent({
        event: "parse_failed",
        properties: {
          area_present: Boolean(areaId),
          error_category: "capture_save_or_parse_failed",
          feature: "capture",
          used_mock: false,
        },
      });
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
    <div className="flex flex-col gap-6">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Capture</h1>
        <p className="text-sm text-muted-foreground">
          Save thought now, then choose whether to organize with AI sorting.
        </p>
      </section>

      <Card className="max-w-3xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Parser status: {parserStatusLabel}</CardTitle>
          <CardDescription>{parserStatusDetail}</CardDescription>
        </CardHeader>
      </Card>

      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer select-none">System details</summary>
        <p className="mt-2">
          Save capture and Save and parse write persisted capture rows through the
          current data provider. Structure locally and Recent captures use local
          session state only.
        </p>
        <span className="sr-only">local session state only</span>
        {provider ? (
          <p>
            Persisted provider: <strong>{provider}</strong>
          </p>
        ) : null}
      </details>

      {areasState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading capture context...
        </p>
      ) : null}

      {areasState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Capture context could not load</AlertTitle>
          <AlertDescription>{areasState.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Capture a thought</CardTitle>
          <CardDescription>
            The fastest path is one quick thought and one next action.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label htmlFor="raw_capture" className="text-sm font-medium">
            What are you thinking about?
          </label>
          <Textarea
            id="raw_capture"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="What's on your mind? Type anything..."
            className="resize-y"
          />

          <form onSubmit={handleSaveCapture} className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">Save options</h2>
            <label htmlFor="area_persist" className="text-sm font-medium">
              Area for this saved item
            </label>
            <Select
              id="area_persist"
              value={areaId ?? ""}
              onChange={(e) => handleAreaChange(e.target.value)}
              disabled={saveState.status === "saving"}
              className="max-w-xs"
            >
              <option value="">No area yet</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Selecting an area here also updates the header session workflow area
              when a matching local workflow area exists.
            </p>

            {areasState.status === "ready" && areas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active areas are available yet. You can still save an unscoped
                capture.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saveState.status === "saving"}>
                {saveState.status === "saving" ? "Saving..." : "Save capture"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSaveAndParse()}
                disabled={parseState.status === "parsing"}
              >
                {parseState.status === "parsing"
                  ? parseState.parserMode === "mock"
                    ? "Retrying with mock parser..."
                    : "Saving and parsing..."
                  : "Save and parse"}
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              The header workflow area picker controls local session drafts and
              the recent-captures list on this page.
            </p>
            <Button type="button" variant="secondary" onClick={handleStructure}>
              Save in this browser
            </Button>
          </div>

          {latestDraft && latestAssessment && latestProposalDraft ? (
            <Card className="border-cyan-500/40 bg-cyan-500/10">
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="font-semibold">Demo mode created a draft bundle.</p>
                <p>Task draft: {latestDraft.title}</p>
                <p>First suggested action: {latestAssessment.recommended_first_move}</p>
                <p>
                  Possible local block:{" "}
                  {new Date(latestProposalDraft.proposed_start).toLocaleTimeString()} –{" "}
                  {new Date(latestProposalDraft.proposed_end).toLocaleTimeString()}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      {saveState.status === "saved" ? (
        <Alert variant="success">
          <AlertTitle>Capture saved</AlertTitle>
          <AlertDescription>
            Stored through <strong>{saveState.provider}</strong> with status{" "}
            <strong>{saveState.capture.status}</strong>.
          </AlertDescription>
        </Alert>
      ) : null}

      {saveState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Capture was not saved</AlertTitle>
          <AlertDescription>{saveState.message}</AlertDescription>
        </Alert>
      ) : null}

      {parseState.status === "parsed" ? (
        <Alert>
          <AlertTitle>Capture parsed</AlertTitle>
          <AlertDescription>
            Parser: <strong>{parseState.parser}</strong>. Sent to review:{" "}
            <strong>{parseState.draftCount}</strong>.
          </AlertDescription>
          {parseState.triageRequired ? (
            <AlertDescription>
              {parseState.lowConfidence
                ? "Drafts were routed to triage because confidence is low."
                : "Drafts were routed to triage for review before acceptance."}
            </AlertDescription>
          ) : (
            <AlertDescription>
              Capture is parseable and drafts are still reviewable in triage before
              acceptance.
            </AlertDescription>
          )}
        </Alert>
      ) : null}

      {parseState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Capture parse failed safely</AlertTitle>
          <AlertDescription>{parseState.message}</AlertDescription>
          {parseState.canRetryWithMock && lastSavedCapture ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRetryWithMockParser()}
              >
                Retry with mock parser
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Recent captures (this browser only)</h2>
        {visibleCaptures.length === 0 ? (
          <EmptyState
            title="No captures in this browser for this area yet."
            description="Use Save in this browser for local draft flow, or Save thought for durable storage."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visibleCaptures.map((capture) => {
              const area = getAreaById(capture.area_id);
              return (
                <Card key={capture.id}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-medium">{capture.raw_text}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Status: {capture.status}</Badge>
                        {area ? <Badge variant="secondary">Area: {area.name}</Badge> : null}
                      </div>
                    </div>
                    <Badge variant="secondary">This browser only</Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

