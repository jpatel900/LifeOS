"use client";

import Link from "next/link";
import { FormEvent, type KeyboardEvent, useEffect, useState } from "react";
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
import { DiagnosticsDisclosure } from "../components/DiagnosticsDisclosure";
import { EmptyState } from "../components/EmptyState";
import { WorkflowPageHeader } from "../components/WorkflowPageHeader";
import { buildParsedWorkflowResult } from "@/lib/ai/parseCaptureWorkflow";
import { getAreaById } from "@/lib/mockData";
import {
  createCaptureItem,
  listAreas,
  listCaptureItems,
  type DataProvider,
} from "@/lib/data/workflow";
import { captureEvent } from "@/lib/observability";
import {
  aiSortingAvailabilityDetail,
  aiSortingAvailabilityLabel,
  saveModeLabel,
  savedViaLabel,
} from "@/lib/statusVocabulary";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { captureLifecycleDisplay } from "@/lib/workflowLifecycle";
import { useWorkflow } from "@/lib/WorkflowContext";
import {
  persistedAreaIdForWorkflowAreaId,
  workflowAreaIdForPersistedArea,
} from "@/lib/workflowAreaMapping";
import {
  buildAreaAccentStyle,
  resolveAreaById,
  resolveSelectedArea,
} from "@/lib/areaAccent";

type AreasState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; provider: DataProvider; areas: Area[] };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | {
      status: "saved";
      provider: DataProvider;
      capture: CaptureItem;
      source: "save" | "save_and_organize";
    }
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

type SavedCaptureHistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; captures: CaptureItem[] }
  | { status: "error"; message: string };

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
  const [savedCaptureHistoryState, setSavedCaptureHistoryState] =
    useState<SavedCaptureHistoryState>({ status: "idle" });
  const [text, setText] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [lastSavedCapture, setLastSavedCapture] = useState<CaptureItem | null>(
    null,
  );
  const areas = areasState.status === "ready" ? areasState.areas : [];
  const provider = areasState.status === "ready" ? areasState.provider : null;

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
            setSelectedAreaId(workflowAreaIdForPersistedArea(first));
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
    if (provider !== "supabase") {
      setSavedCaptureHistoryState((current) =>
        current.status === "ready"
          ? current
          : { status: "ready", captures: [] },
      );
      return;
    }

    let cancelled = false;

    async function loadSavedCaptureHistory() {
      setSavedCaptureHistoryState({ status: "loading" });
      try {
        const result = await listCaptureItems(createSupabaseBrowserClient());
        if (!cancelled) {
          setSavedCaptureHistoryState({
            status: "ready",
            captures: result.captures,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSavedCaptureHistoryState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load saved capture history.",
          });
        }
      }
    }

    void loadSavedCaptureHistory();

    return () => {
      cancelled = true;
    };
  }, [provider]);

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
      setSelectedAreaId(workflowAreaIdForPersistedArea(area));
    }
  }

  function addSavedCaptureToHistory(capture: CaptureItem) {
    setSavedCaptureHistoryState((current) => ({
      status: "ready",
      captures: [capture, ...(current.status === "ready" ? current.captures : [])]
        .filter(
          (item, index, items) =>
            items.findIndex((candidate) => candidate.id === item.id) === index,
        ),
    }));
  }

  async function handleSaveCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCaptureOnly();
  }

  async function saveCaptureOnly() {
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
        source: "save",
      });
      addSavedCaptureToHistory(result.capture);
      setLastSavedCapture(result.capture);
      setText("");
      setParseState({ status: "idle" });
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

  function handleCaptureShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      (!event.ctrlKey && !event.metaKey) ||
      saveState.status === "saving"
    ) {
      return;
    }

    event.preventDefault();
    void saveCaptureOnly();
  }

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
          "Capture was saved, but AI sorting stopped safely. Retry with on-device sorting.",
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
        source: "save_and_organize",
      });
      addSavedCaptureToHistory(captureResult.capture);
      setText("");
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

  async function handleOrganizeSavedCapture() {
    if (!lastSavedCapture) {
      return;
    }

    setParseState({ status: "parsing", parserMode: "auto" });
    await parseCaptureForSavedCapture(lastSavedCapture, "auto");
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
      ? aiSortingAvailabilityLabel(parserStatusState.parserStatus)
      : parserStatusState.status === "loading"
        ? "Checking sorting options..."
        : "Sorting status unavailable";
  const parserStatusDetail =
    parserStatusState.status === "ready"
      ? aiSortingAvailabilityDetail(parserStatusState.parserStatus)
      : "You can still save thoughts and organize them on this device.";
  const selectedArea = resolveSelectedArea(state.areas, selectedAreaId);
  const selectedAreaStyle = buildAreaAccentStyle(selectedArea?.color);

  const persistedAreaId = selectedAreaId
    ? persistedAreaIdForWorkflowAreaId(selectedAreaId, areas)
    : null;
  const selectedAreaMatches = (captureAreaId: string | null) => {
    if (!selectedAreaId) {
      return true;
    }

    return captureAreaId === selectedAreaId || captureAreaId === persistedAreaId;
  };

  const visibleCaptures = state.captureItems.filter((capture) => {
    return selectedAreaMatches(capture.area_id);
  });
  const visibleSavedCaptures =
    savedCaptureHistoryState.status === "ready"
      ? savedCaptureHistoryState.captures.filter((capture) =>
          selectedAreaMatches(capture.area_id),
        )
      : [];

  const latestAssessment = state.ambiguityAssessments[0];
  const latestDraft = state.taskDrafts[0];
  const latestProposalDraft = state.timeBlockProposalDrafts[0];

  return (
    <div className="flex flex-col gap-6">
      <WorkflowPageHeader
        eyebrow="Raw first"
        title="Capture"
        description="Get the thought out before you shape it. Save the raw version first, then organize only if you want help deciding what it is."
        spotlight={
          <div className="workflow-metric-grid">
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Save mode</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {provider ? saveModeLabel(provider) : "Checking"}
              </p>
              <p className="workflow-metric-context">
                Raw capture truth stays explicit before any sorting step.
              </p>
            </div>
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Sorting help</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {parserStatusLabel}
              </p>
              <p className="workflow-metric-context">{parserStatusDetail}</p>
            </div>
            <div className="workflow-metric-card">
              <p className="workflow-metric-label">Current area</p>
              <p className="workflow-metric-value text-[1.35rem]">
                {selectedArea?.name ?? "None yet"}
              </p>
              <p className="workflow-metric-context">
                You can save unscoped, but area keeps later planning cleaner.
              </p>
            </div>
          </div>
        }
      />

      <DiagnosticsDisclosure>
        <p>
          Save thought and Save and organize use your current save mode.
          Organize on this device and recent captures stay on this device.
        </p>
        {provider ? (
          <>
            <p>
              Save mode: <strong>{saveModeLabel(provider)}</strong>
            </p>
            <p>
              Technical save mode id: <strong>{provider}</strong>
            </p>
          </>
        ) : null}
      </DiagnosticsDisclosure>

      {areasState.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking saved areas. You can still capture now.
        </p>
      ) : null}

      {areasState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Capture context could not load</AlertTitle>
          <AlertDescription>{areasState.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card
        data-testid="capture-main-card"
        className="workflow-primary-card max-w-3xl"
      >
        <CardHeader>
          <CardTitle>Write it down</CardTitle>
          <CardDescription>
            Start with the raw thought. Save the simplest valid version, then
            decide whether it needs sorting help.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={handleSaveCapture}
            id="capture-save-form"
            data-testid="capture-save-options-card"
            data-accent-strength="subtle"
            style={selectedAreaStyle}
            className="area-accent-card space-y-4 rounded-lg border p-4"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="raw_capture" className="text-sm font-medium">
                    What are you thinking about?
                  </label>
                  <Textarea
                    id="raw_capture"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleCaptureShortcut}
                    rows={8}
                    placeholder="What's on your mind? Type anything..."
                    className="resize-y"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  After Save thought or Save and organize, this field clears so
                  you can capture the next thought.
                </p>
              </div>

              <div className="workflow-action-tray space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Where should this land?</p>
                  {selectedArea ? (
                    <Badge
                      variant="secondary"
                      className="area-accent-chip inline-flex items-center gap-2 rounded-full"
                    >
                      <span
                        aria-hidden
                        className="area-accent-dot h-2 w-2 rounded-full"
                      />
                      Current area: {selectedArea.name}
                    </Badge>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <label htmlFor="area_persist" className="text-sm font-medium">
                    Area for this saved thought
                  </label>
                  <Select
                    id="area_persist"
                    value={areaId ?? ""}
                    onChange={(e) => handleAreaChange(e.target.value)}
                    disabled={saveState.status === "saving"}
                    className="w-full"
                  >
                    <option value="">No area yet</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecting an area here also updates the header area when a
                  matching local workflow area exists.
                </p>
              </div>
            </div>

            {areasState.status === "ready" && areas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active areas are available yet. You can still save an
                unscoped capture.
              </p>
            ) : null}

            <div className="workflow-action-tray grid gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="workflow-section-kicker">Choose the fastest valid path</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Save raw capture when you want zero friction. Save and organize when
                    you already want draft suggestions next.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Ctrl/Cmd + Enter</Badge>
                  <span>Save thought from the main field.</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Button
                    type="submit"
                    disabled={saveState.status === "saving"}
                    className="w-full"
                  >
                    {saveState.status === "saving" ? "Saving..." : "Save thought"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Save the raw capture first. Organize it after if needed.
                  </p>
                </div>
                <div className="grid gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSaveAndParse()}
                    disabled={parseState.status === "parsing"}
                    className="w-full"
                  >
                    {parseState.status === "parsing"
                      ? parseState.parserMode === "mock"
                        ? "Retrying with on-device sorting..."
                        : "Saving and sorting..."
                      : "Save and organize"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Save first, then sort into drafts for Triage.
                  </p>
                </div>
              </div>
            </div>
          </form>

          <div className="workflow-action-tray grid gap-3 border-dashed sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="space-y-1">
              <p className="text-sm font-medium">Local-only draft pass</p>
              <p className="text-xs text-muted-foreground">
                The header area picker controls this device-only draft flow and
                the recent captures on this page.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={handleStructure}
              className="w-full sm:w-auto"
            >
              Organize on this device
            </Button>
          </div>

          {latestDraft && latestAssessment && latestProposalDraft ? (
            <Card className="workflow-secondary-card border-cyan-500/40 bg-cyan-500/10">
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="font-semibold">
                  On-device sorting created suggestions.
                </p>
                <p>Suggested task: {latestDraft.title}</p>
                <p>
                  First suggested action:{" "}
                  {latestAssessment.recommended_first_move}
                </p>
                <p>
                  Suggested time block:{" "}
                  {new Date(
                    latestProposalDraft.proposed_start,
                  ).toLocaleTimeString()}{" "}
                  –{" "}
                  {new Date(
                    latestProposalDraft.proposed_end,
                  ).toLocaleTimeString()}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      {saveState.status === "saved" ? (
        <Alert variant="success" className="workflow-celebration-alert">
          <AlertTitle>Saved.</AlertTitle>
          <AlertDescription>
            {saveState.source === "save_and_organize"
              ? "Saved first, then organized. Review the drafts in Triage next."
              : `This raw capture was ${savedViaLabel(saveState.provider)}. Organize this saved thought next if you want draft suggestions.`}
          </AlertDescription>
          <div className="workflow-celebration-meta">
            <span className="workflow-celebration-chip">
              {savedViaLabel(saveState.provider)}
            </span>
            <span className="workflow-celebration-chip">
              {saveState.source === "save_and_organize"
                ? "Drafts can be reviewed next"
                : "Raw capture is safely stored"}
            </span>
          </div>
          {saveState.source === "save" ? (
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleOrganizeSavedCapture()}
                disabled={parseState.status === "parsing"}
              >
                {parseState.status === "parsing"
                  ? "Organizing saved capture..."
                  : "Organize this saved thought"}
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}

      {saveState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Capture was not saved</AlertTitle>
          <AlertDescription>{saveState.message}</AlertDescription>
        </Alert>
      ) : null}

      {parseState.status === "parsed" ? (
        <Alert className="workflow-celebration-alert">
          <AlertTitle>Drafts ready for Triage.</AlertTitle>
          <AlertDescription>
            Created <strong>{parseState.draftCount}</strong> draft
            {parseState.draftCount === 1 ? "" : "s"}. Review them in Triage
            before you accept anything.
          </AlertDescription>
          <div className="workflow-celebration-meta">
            <span className="workflow-celebration-chip">
              {parseState.draftCount} draft
              {parseState.draftCount === 1 ? "" : "s"}
            </span>
            <span className="workflow-celebration-chip">
              Review before acceptance
            </span>
          </div>
          <div className="mt-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/triage">Review it now</Link>
            </Button>
          </div>
          {parseState.triageRequired ? (
            <AlertDescription>
              {parseState.lowConfidence
                ? "Drafts were routed to triage because confidence is low."
                : "Drafts were routed to triage for review before acceptance."}
            </AlertDescription>
          ) : (
            <AlertDescription>
              Capture is parseable and drafts are still reviewable in triage
              before acceptance.
            </AlertDescription>
          )}
        </Alert>
      ) : null}

      {parseState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>AI sorting stopped safely</AlertTitle>
          <AlertDescription>{parseState.message}</AlertDescription>
          {parseState.canRetryWithMock && lastSavedCapture ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleRetryWithMockParser()}
              >
                Retry with on-device sorting
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {provider === "supabase"
            ? "Recent saved captures"
            : "Recent saved captures on this device"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {provider === "supabase"
            ? "These are durable saved captures for the selected area."
            : "These saved captures stay on this device in this browser session."}
        </p>
        {savedCaptureHistoryState.status === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking saved capture history.
          </p>
        ) : null}
        {savedCaptureHistoryState.status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle>Saved capture history unavailable</AlertTitle>
            <AlertDescription>
              {savedCaptureHistoryState.message}
            </AlertDescription>
          </Alert>
        ) : null}
        {savedCaptureHistoryState.status === "ready" &&
        visibleSavedCaptures.length === 0 ? (
          <EmptyState
            title={
              provider === "supabase"
                ? "No saved captures for this area yet."
                : "No saved captures on this device for this area yet."
            }
            description={
              provider === "supabase"
                ? "Use Save thought or Save and organize to create durable capture history for this area."
                : "Use Save thought or Save and organize to create saved capture history on this device."
            }
          />
        ) : null}
        {savedCaptureHistoryState.status === "ready" &&
        visibleSavedCaptures.length > 0 ? (
          <div className="flex flex-col gap-2">
            {visibleSavedCaptures.map((capture) => {
              const area =
                areas.find(
                  (candidate) =>
                    candidate.id === capture.area_id ||
                    workflowAreaIdForPersistedArea(candidate) ===
                      capture.area_id,
                ) ?? getAreaById(capture.area_id);
              const lifecycle = captureLifecycleDisplay(capture.status);
              const captureAreaStyle = buildAreaAccentStyle(area?.color);
              return (
                <Card
                  key={capture.id}
                  data-testid="capture-recent-card"
                  data-accent-strength="subtle"
                  style={captureAreaStyle}
                  className="area-accent-card workflow-secondary-card"
                >
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-medium">{capture.raw_text}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                        {area ? (
                          <Badge variant="secondary">Area: {area.name}</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {lifecycle.detail}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {provider === "supabase"
                        ? "Saved to account"
                        : "Saved in this session"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          Recent captures organized on this device
        </h2>
        <p className="text-sm text-muted-foreground">
          This local draft flow is separate from saved capture history.
        </p>
        {visibleCaptures.length === 0 ? (
          <EmptyState
            title="No device-only organized captures for this area yet."
            description="Use Organize on this device for local drafts, or review saved captures above after Save thought."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visibleCaptures.map((capture) => {
              const area =
                resolveAreaById(state.areas, capture.area_id) ??
                getAreaById(capture.area_id);
              const lifecycle = captureLifecycleDisplay(capture.status);
              const captureAreaStyle = buildAreaAccentStyle(area?.color);
              return (
                <Card
                  key={capture.id}
                  data-testid="capture-recent-card"
                  data-accent-strength="subtle"
                  style={captureAreaStyle}
                  className="area-accent-card workflow-secondary-card"
                >
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="font-medium">{capture.raw_text}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant={lifecycle.variant}>{lifecycle.label}</Badge>
                        {area ? (
                          <Badge variant="secondary">Area: {area.name}</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {lifecycle.detail}
                      </p>
                    </div>
                    <Badge variant="secondary">Device-only draft</Badge>
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
