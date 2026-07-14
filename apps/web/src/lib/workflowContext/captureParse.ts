// WorkflowContext domain module — capture submission + AI parse.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only — no logic/behavior changes). Covers the raw-capture stage +
// AI-parse round-trip: staging/persisting a raw capture, the offline queue
// hand-off, and driving `captureParse` state through the parse client. None
// of these were hooks in the original file (plain `function`/`async
// function` declarations), so — like persistenceSync.ts — they are wrapped
// in one factory WorkflowContext calls once per render.
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Area, Person } from "@lifeos/schemas";
import { getOperatorProfile, listPeople } from "../data/workflow";
import { normalizePersonName, resolvePersonMention } from "../data/personLinks";
import {
  recordCommitmentProposal,
  recordPersonMentionProposal,
} from "../data/workflow";
import { createSupabaseBrowserClient } from "../supabase/browser";
import { enqueueCapture } from "../capture/offlineQueue";
import { buildParsedWorkflowResult } from "../ai/parseCaptureWorkflow";
import {
  requestParseCapture,
  type ParseCaptureOperatorProfileContext,
  type ParseCaptureParserMode,
} from "../ai/parseCaptureClient";
import {
  appendParsedWorkflowResult,
  submitRawCapture,
  type WorkflowState,
} from "../workflow";
import { persistedAreaIdForWorkflowId } from "./reducerCore";
import type { ApplyWorkflowState } from "./applyWorkflowState";
import type { CaptureParseState } from "./types";

export interface CaptureParseDeps {
  activeParseCaptureIdRef: MutableRefObject<string | null>;
  setCaptureParse: Dispatch<SetStateAction<CaptureParseState>>;
  captureParse: CaptureParseState;
  stateRef: MutableRefObject<WorkflowState>;
  persistedAreasRef: MutableRefObject<Area[]>;
  applyWorkflowState: ApplyWorkflowState;
  persistCapture: (
    localCapture: WorkflowState["captureItems"][number],
  ) => Promise<void>;
  markLocalOnly: (message: string) => void;
  markPersistedSaveFailure: (error: unknown) => void;
  refreshUnsyncedCount: () => Promise<void>;
}

export function createCaptureParseOps(deps: CaptureParseDeps) {
  const {
    activeParseCaptureIdRef,
    setCaptureParse,
    captureParse,
    stateRef,
    persistedAreasRef,
    applyWorkflowState,
    persistCapture,
    markLocalOnly,
    markPersistedSaveFailure,
    refreshUnsyncedCount,
  } = deps;

  async function parseCaptureIntoDrafts(
    capture: WorkflowState["captureItems"][number],
    parserMode: ParseCaptureParserMode,
  ) {
    activeParseCaptureIdRef.current = capture.id;
    setCaptureParse({ phase: "parsing", captureId: capture.id, parserMode });

    // Best-effort: attach the signed-in user's access token so the parse route
    // can write a user-scoped, fire-and-forget AI call trace row (issue #288).
    // Parsing itself never requires this token, so any failure here is ignored.
    let authorization: string | undefined;
    try {
      const authClient = createSupabaseBrowserClient();
      if (authClient) {
        const { data } = await authClient.auth.getSession();
        const accessToken = data.session?.access_token?.trim();
        if (accessToken) {
          authorization = `Bearer ${accessToken}`;
        }
      }
    } catch {
      // Tracing is optional; a missing/failed session must never block parsing.
    }

    // S3 (#255): live charter/profile read path. S2 landed the context-assembly
    // module, storage, and injection; the request-time read was deferred to
    // this slice. Read persisted charters + the operator profile and forward
    // them through the S2 plumbing. An empty charter/profile leaves the prompt
    // byte-identical to baseline (S2 parity), and any read failure degrades to
    // the pre-S3 name-only context — personalization must never block parsing.
    const persistedAreas = persistedAreasRef.current;
    const charterBySlug = new Map(
      persistedAreas.map((area) => [
        area.slug,
        typeof area.charter_text === "string" ? area.charter_text : null,
      ]),
    );

    let operatorProfileContext: ParseCaptureOperatorProfileContext | undefined;
    try {
      const profileClient = createSupabaseBrowserClient();
      if (profileClient) {
        const profile = await getOperatorProfile(profileClient);
        if (profile) {
          operatorProfileContext = {
            profileText: profile.profile_text,
            compensationRules: profile.compensation_rules,
          };
        }
      }
    } catch {
      // Personalization is best-effort; a failed profile read must never block
      // parsing. Fall through with no operator profile (S2 empty-profile parity).
    }

    // S3 (#255): load existing people so a proposed mention can resolve against
    // one (normalized_name matching) instead of always proposing a new person.
    // Best-effort — a failed read degrades resolution to "new", never blocks.
    let peopleForResolution: Person[] = [];
    try {
      peopleForResolution = await listPeople(createSupabaseBrowserClient());
    } catch {
      // People read is best-effort; fall through with no candidates.
    }

    const result = await requestParseCapture({
      rawText: capture.raw_text,
      areaContext: stateRef.current.areas.map((area) => {
        const slug = area.name.toLowerCase().replace(/\s+/g, "-");
        return {
          slug,
          name: area.name,
          charterText: charterBySlug.get(slug) ?? null,
        };
      }),
      operatorProfile: operatorProfileContext,
      parserMode,
      authorization,
    });

    if (result.ok) {
      const parsed = buildParsedWorkflowResult({
        response: result.response,
        capture,
        workflowAreaId: capture.area_id,
      });
      applyWorkflowState(appendParsedWorkflowResult(stateRef.current, parsed));

      // Born instrumented (NS-INV-3): record person/commitment proposals as
      // pending suggestions. Fire-and-forget — a learning-write failure must
      // never affect parsing or triage. Nothing is persisted to `people` here;
      // approval happens in triage (NS-INV-4).
      const learningClient = createSupabaseBrowserClient();
      for (const draft of parsed.taskDrafts) {
        const area_id = persistedAreaIdForWorkflowId(
          draft.area_id,
          persistedAreasRef.current,
        );
        for (const mention of draft.person_mentions) {
          // Resolve against existing people by normalized name; a match records
          // the linked person id, otherwise the proposal is a new-person one.
          const resolution = resolvePersonMention(mention, peopleForResolution);
          recordPersonMentionProposal(learningClient, {
            area_id,
            draft_id: draft.id,
            name: mention.name,
            role: mention.role,
            confidence: mention.confidence,
            match: resolution.kind === "matched" ? "matched" : "new",
            matched_person_id:
              resolution.kind === "matched" ? resolution.person.id : null,
          });
        }
        if (draft.is_commitment) {
          recordCommitmentProposal(learningClient, {
            area_id,
            draft_id: draft.id,
            title: draft.title,
            confidence: draft.confidence,
          });
        }
      }
    }

    if (activeParseCaptureIdRef.current !== capture.id) {
      return;
    }

    setCaptureParse(
      result.ok
        ? {
            phase: "parsed",
            captureId: capture.id,
            parser: result.parser,
            status: result.status,
          }
        : {
            phase: "failed",
            captureId: capture.id,
            status: result.status,
            message: result.error,
            canRetryWithMock: result.canRetryWithMock,
          },
    );
  }

  // FR-027: offline → save the raw capture to the durable device queue with NO
  // parse wait and end synchronously as saved; it syncs to the spine on reconnect
  // (parse happens later at triage). We deliberately do NOT stage it into local
  // captureItems — it would double-appear once the reconnect sync loads the
  // server row. Offline scope is raw capture only (no offline triage).
  function enqueueOfflineCapture(
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) {
    void enqueueCapture({ rawText, areaId, returnHook: returnHook ?? null })
      .then(() => refreshUnsyncedCount())
      .catch(() =>
        markLocalOnly("Capture could not be saved offline; please try again."),
      );
  }

  // Stage + persist the raw capture item WITHOUT parsing it. Shared by the
  // parse-and-save path (submitCaptureText) and the explicit save-raw path
  // (submitCaptureRaw); the caller decides whether to parse the returned item.
  function stageAndPersistRawCapture(
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) {
    const previous = stateRef.current;
    const next = submitRawCapture(previous, { rawText, areaId, returnHook });
    const localCapture = next.captureItems.find(
      (capture) =>
        !previous.captureItems.some((item) => item.id === capture.id),
    );

    // Raw capture is staged and persisted before any parse attempt.
    applyWorkflowState(next);

    if (localCapture) {
      void persistCapture(localCapture).catch((error) => {
        markPersistedSaveFailure(error);
      });
    }

    return localCapture;
  }

  function submitCaptureText(
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) {
    if (captureParse.phase === "parsing") {
      stageAndPersistRawCapture(rawText, areaId, returnHook);
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      enqueueOfflineCapture(rawText, areaId, returnHook);
      return;
    }

    const localCapture = stageAndPersistRawCapture(rawText, areaId, returnHook);
    if (localCapture) {
      void parseCaptureIntoDrafts(localCapture, "auto");
    }
  }

  // G1 floor follow-up: explicit "save raw" — persist the thought verbatim and
  // SKIP the AI parse. The raw capture item lands in the spine and is parsed
  // later at triage, exactly like the offline→reconnect path. Gives the operator
  // control (and speed: no parse wait) when a thought should not be auto-drafted.
  function submitCaptureRaw(
    rawText: string,
    areaId: string | null,
    returnHook?: string | null,
  ) {
    if (captureParse.phase === "parsing") {
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      enqueueOfflineCapture(rawText, areaId, returnHook);
      return;
    }

    stageAndPersistRawCapture(rawText, areaId, returnHook);
  }

  function retryCaptureParseWithMock() {
    if (captureParse.phase !== "failed") {
      return;
    }

    const capture = stateRef.current.captureItems.find(
      (item) => item.id === captureParse.captureId,
    );
    if (!capture) {
      return;
    }

    void parseCaptureIntoDrafts(capture, "mock");
  }

  return {
    parseCaptureIntoDrafts,
    stageAndPersistRawCapture,
    submitCaptureText,
    submitCaptureRaw,
    retryCaptureParseWithMock,
  };
}

export type CaptureParseOps = ReturnType<typeof createCaptureParseOps>;
