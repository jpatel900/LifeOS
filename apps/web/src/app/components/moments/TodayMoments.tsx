"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Settings as SettingsIcon } from "lucide-react";
import { useWorkflow } from "@/lib/WorkflowContext";
import { buildCockpitAccentStyle } from "@/lib/cockpit/accent";
import { resolveSelectedArea } from "@/lib/areaAccent";
import { momentKeyLabel } from "@/lib/keys/keymap";
import { SAVED_ON_THIS_DEVICE_SHORT } from "@/lib/statusVocabulary";
import { cn } from "@/lib/utils";
import { useMomentKeyboard } from "./useMomentKeyboard";
import { HIT_TARGET_MIN } from "./hitTarget";
import { buildStartVM, buildFlowVM, buildCloseVM } from "./momentsViewModel";
import { MomentSwitcher, type MomentValue } from "./MomentSwitcher";
import { BottomNavigator } from "./BottomNavigator";
import {
  CountdownClockToggle,
  type CountdownClockValue,
} from "./CountdownClockToggle";
import { AreaSelector } from "./AreaSelector";
import { MastheadThemeToggle } from "./MastheadThemeToggle";
import { MastheadSaveState } from "./MastheadSaveState";
import { formatMastheadDate } from "./formatMastheadDate";
import { CaptureAffordance } from "./CaptureAffordance";
import { AuthAffordance } from "./AuthAffordance";
import { KeyboardLegend } from "./KeyboardLegend";
import { CaptureOverlay } from "./CaptureOverlay";
import { CommandPalette, type CommandPaletteAction } from "./CommandPalette";
import { StartMoment } from "./StartMoment";
import { FlowMoment } from "./FlowMoment";
import { CloseMoment, type CloseTaskMapRevisionVM } from "./CloseMoment";
import { useTaskMapCloseRevisionOffer } from "./useTaskMapCloseRevisionOffer";
import type { TaskMapDraftUiState } from "./TaskMapSection";
import type { TaskMapGraph } from "@/lib/taskmap/graph";
import { validateTaskMapForPersistence } from "@/lib/taskmap/persistence";
import { useReEntryRitual } from "./useReEntryRitual";
import { ReEntryRitual, type RecoveryCandidate } from "./ReEntryRitual";
import {
  createBriefViewRecorder,
  type BriefViewRecorder,
} from "@/lib/reEntry/briefView";
import {
  localDayStamp,
  recordPurposeGaugeCheckinFireAndForget,
  shouldOfferPurposeGaugeCheckin,
} from "@/lib/purpose/purposeGaugeCheckin";
import type { PurposeGaugeResponse } from "@/lib/purpose/purposeGaugePolicy";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useOnboardingRitual } from "./useOnboardingRitual";
import { OnboardingRitual } from "./OnboardingRitual";
import { readDayShapePreferences } from "@/lib/onboarding/onboarding";
import { buildPipelineCounts } from "./pipelineCounts";
import { TriageSheet } from "./TriageSheet";
import { PlanSheet } from "./PlanSheet";
import { ReviewSheet } from "./ReviewSheet";
import { HealthSheet } from "./HealthSheet";
import { AreasSheet } from "./AreasSheet";
import { useSheetUrlState } from "./useSheetUrlState";
import { useOverlayUrlState, parseOverlayParam } from "./useOverlayUrlState";
import { isSheetValue } from "./sheetValues";
import { parseMomentParam, useMomentUrlState } from "./useMomentUrlState";
import {
  parseAreaParam,
  urlWithArea,
  useAreaUrlState,
} from "./useAreaUrlState";
import { EndSessionSheet } from "./EndSessionSheet";
import type { DeepLinkTarget } from "./deepLink";
import type { ToastAction } from "./toast";
import { useFlowFocusSession } from "./useFlowFocusSession";
import { RunningSessionReturn } from "./RunningSessionReturn";
import { useCloseMomentRollups } from "./useCloseMomentRollups";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * Container that wires the P1 view-model builders and P2 presentation
 * primitives to WorkflowContext. Owns the moment/capture/palette UI state,
 * preferences persistence, and cross-moment coordination (primary action,
 * command palette, deep links, toast). No fetches; renders at `/` when
 * NEXT_PUBLIC_MOMENTS_HOME is on (see app/page.tsx).
 *
 * #590 slice 3: Flow's focus-session/task-map wiring and Close's wins/rollup
 * harvesting now live in `useFlowFocusSession` and `useCloseMomentRollups`
 * respectively (screen logic + view-model section moved together, per
 * moment). This file stays the thin composition root — it owns the
 * moment/capture/palette/toast state that is genuinely shared across all
 * three moments, and wires the two hooks' outputs into `<StartMoment>` /
 * `<FlowMoment>` / `<CloseMoment>`.
 */

const PREFERENCES_KEY = "lifeos.moments.preferences";
const CAPTURE_DRAFT_KEY = "lifeos.moments.captureDraft";
// FR-047 slice 2 (#686): the local day (YYYY-MM-DD) a purpose-gauge check-in
// was last taken, so the optional Close offer doesn't re-appear after it was
// answered that day. A decline never writes this — it stays re-offerable,
// which is fine for an asked-only surface (FR-033).
const PURPOSE_GAUGE_KEY = "lifeos.moments.purposeGaugeLastChecked";

function readPurposeGaugeLastChecked(): string | null {
  try {
    return window.localStorage.getItem(PURPOSE_GAUGE_KEY);
  } catch {
    return null;
  }
}

function writePurposeGaugeLastChecked(day: string): void {
  try {
    window.localStorage.setItem(PURPOSE_GAUGE_KEY, day);
  } catch {
    // Blocked storage (private mode, quota) — the offer may re-appear later
    // the same day, harmless: a re-tap is a DB no-op (append-only PK).
  }
}
const TOAST_DURATION_MS = 2500;
// SP-6: undo over confirm. A toast carrying an Undo action stays up longer
// (6s) than a plain acknowledgement (2.5s) — the extra time is the reading
// + decision budget for the one thing a mistake is worth reversing.
const TOAST_WITH_ACTION_DURATION_MS = 6000;
const DEFAULT_FOCUS_MINUTES = 25;

/** SP-6: the toast slot's action — a real, focusable (never auto-focused) Undo button. */
export type { ToastAction };

interface ToastState {
  message: string;
  action?: ToastAction;
}

interface StoredPreferences {
  moment?: MomentValue;
  // C2-S8 (#687 finding 4): the countdown-vs-clock time display format stays
  // device-local on purpose — same class of preference as the theme toggle,
  // not a piece of app state anyone would expect a shared link to carry.
  timeDisplay?: CountdownClockValue;
}

function readStoredPreferences(): StoredPreferences | null {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPreferences;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPreferences(prefs: StoredPreferences): void {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Blocked storage (private mode, quota, etc.) — preferences just won't persist.
  }
}

// SP-5: unsaved capture text must survive an accidental close/reopen within
// the session, but must not haunt a brand-new session — sessionStorage, not
// localStorage. Cleared only on a successful save; an Esc/close/re-entry
// ritual must never clear it. Mirrors the try/catch-guarded idiom used by
// readStoredPreferences/writeStoredPreferences and the reentry suppression
// helpers in useReEntryRitual.ts.
function readStoredCaptureDraft(): string {
  try {
    return window.sessionStorage.getItem(CAPTURE_DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredCaptureDraft(text: string): void {
  try {
    if (text) {
      window.sessionStorage.setItem(CAPTURE_DRAFT_KEY, text);
    } else {
      window.sessionStorage.removeItem(CAPTURE_DRAFT_KEY);
    }
  } catch {
    // Blocked storage (private mode, quota, etc.) — draft just won't persist.
  }
}

function heuristicMoment(now: Date, hasCurrentBlock: boolean): MomentValue {
  const hour = now.getHours();
  if (hour < 11) return "start";
  if (hour >= 17) return "close";
  return hasCurrentBlock ? "flow" : "start";
}

export interface TodayMomentsProps {
  initialMoment?: MomentValue;
  now?: Date;
  deepLink?: DeepLinkTarget;
}

export function TodayMoments({
  initialMoment,
  now: nowProp,
  deepLink,
}: TodayMomentsProps) {
  // SP-10: relative/aging labels (schedule "in Xm"/"Xm left" rows, waiting-on
  // day counts) and the mount-time-of-day moment heuristic all derive from
  // `now`. Left frozen at mount, `now` goes stale in a long-lived tab. When
  // no `now` is injected (production path), self-refresh into state on a
  // slow ~60s cadence, aligned to the minute boundary via a self-rescheduling
  // setTimeout (mirrors the SP-2 anchored-scheduler style — no drift, no
  // interval left running while irrelevant). When `nowProp` IS injected
  // (tests), the timer never arms: `now` stays exactly the injected value,
  // so existing and new deterministic tests are unaffected unless they
  // explicitly opt into the default-clock path.
  const router = useRouter();
  const [autoNow, setAutoNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (nowProp) return undefined;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function schedule() {
      if (cancelled) return;
      const delay = 60000 - (Date.now() % 60000);
      timeoutId = setTimeout(() => {
        setAutoNow(new Date());
        schedule();
      }, delay);
    }

    schedule();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [nowProp]);
  const now = nowProp ?? autoNow;

  // #690 Part 2: the moments home is area-scoped (selectedAreaId drives every
  // stage view model below). Mirror LifeOSCockpit's screen-accent wiring so
  // the --acc token family (emphasis borders, progression rail, schedule and
  // pipeline tints — all `var(--acc)` consumers) takes the active area's color
  // at this scoped container instead of the fixed .lifeos-cockpit default.
  // Same buildCockpitAccentStyle the stage routes use, so the home and the
  // stage agree on the accent for a given area. Mounted guard mirrors
  // MomentsThemeShell: default dark until next-themes resolves, so the SSR and
  // first-client style strings match (no hydration mismatch). The base --acc
  // is dark-independent; only the surface/ring derivations settle on mount.
  const { resolvedTheme } = useTheme();
  const [accentThemeMounted, setAccentThemeMounted] = useState(false);
  useEffect(() => {
    setAccentThemeMounted(true);
  }, []);

  const {
    state,
    selectedAreaId,
    setSelectedAreaId,
    syncStatus,
    syncPersistedAreas,
    submitCaptureText,
    startTaskSession,
    markSession,
    deferTask,
    deferTaskWithSession,
    updateTaskFirstTinyStep,
    carryForwardTask,
    saveReview,
    confirmWin,
    confirmRollup,
    listApprovedRollups,
    refreshPersistedWorkflow,
    promoteBacklogTask,
    unsyncedCaptureCount,
    accountClosedDays,
    journalledClosedDays,
    accountLoggedWins,
    journalledLoggedWins,
    journalledCompletedSessionDays,
    journalledRollupKeys,
    workflowAreaIdByPersistedId,
    areasReadbackSettled,
    taskMapDraft,
    requestTaskMapDraft,
    dismissTaskMapDraft,
    approveTaskMapDraft,
    toggleTaskMapNodeCompletion,
  } = useWorkflow();

  // #581: the onboarding ritual owns the screen ahead of everything else on
  // a zero-state (or Settings-rerun) session. The re-entry ritual is
  // disabled while onboarding is eligible/active — a brand-new account has
  // nothing to be welcomed back to.
  const onboarding = useOnboardingRitual({ state });
  const onboardingActive = onboarding.active;

  const ritual = useReEntryRitual({
    state,
    now,
    enabled: !onboardingActive && !onboarding.pending,
    refreshPersistedWorkflow,
  });
  const ritualActive =
    ritual.status === "deferring" || ritual.status === "ready";

  const [recoverySwapIndex, setRecoverySwapIndex] = useState(0);

  // #690 Part 2: resolve the active area the same way the stage cockpit does
  // (`activeArea ?? areas[0]`, via resolveSelectedArea) so an "All areas"
  // selection lands on the same default accent as the stage routes.
  const accentAreaColor = resolveSelectedArea(
    state.areas,
    selectedAreaId,
  )?.color;
  const accentStyle = useMemo(
    () =>
      buildCockpitAccentStyle(
        accentAreaColor,
        !accentThemeMounted || resolvedTheme !== "light",
      ),
    [accentAreaColor, accentThemeMounted, resolvedTheme],
  );

  const startVM = useMemo(
    () => buildStartVM(state, { now, selectedAreaId }),
    [state, now, selectedAreaId],
  );
  const flowVM = useMemo(() => buildFlowVM(state, { now }), [state, now]);
  // Audit P0#4: the two day-close tiers are inputs to the Close view model,
  // so "today is closed" is derived in ONE place (the view model) rather than
  // re-answered by each surface that wants to know.
  const closeVM = useMemo(
    () =>
      buildCloseVM(state, {
        now,
        accountClosedDays,
        journalledClosedDays,
        // #737 C1 re-score GAP 1: and the same two tiers for "which wins are
        // already logged", so the offer and the verdict are both answered from
        // durable facts rather than from this tab's memory.
        accountLoggedWins,
        journalledLoggedWins,
        // #737 C1 re-score GAP 4: the device tier of "a blockless session was
        // finished today". The account tier of the same fact rides in on
        // `state.executionSessions`.
        journalledCompletedSessionDays,
      }),
    [
      state,
      now,
      accountClosedDays,
      journalledClosedDays,
      accountLoggedWins,
      journalledLoggedWins,
      journalledCompletedSessionDays,
    ],
  );

  // C2-S6 (#687): the moment itself is URL-visible, same contract as the
  // sheet below — `useMomentUrlState` owns the push/pop mechanics, this
  // component resolves the INITIAL moment through FOUR tiers: `initialMoment`
  // prop (test-only override, always wins outright) -> the URL's own
  // `?moment=` param (the redirect shims' real answer, e.g. `/execute` ->
  // `/?moment=flow`) -> stored preference -> clock heuristic. The URL tier
  // lives HERE, not inside the hook: the hook cannot tell a genuine
  // `initialMoment` override from a stale `?moment=` param an earlier,
  // unrelated render left behind (a real bug this order fixes — see
  // useMomentUrlState.ts's own JSDoc). The hook then reconciles the
  // resolved value into the URL at mount (a no-op when they already agree,
  // self-healing otherwise).
  //
  // C2-S8 (#687 finding 3, root-caused via a direct SSR curl of
  // `/?moment=flow`, which came back with `data-testid="close-moment"` in
  // the raw HTML): the URL tier used to read `window.location` directly,
  // which does not exist during SSR — so on the SERVER this tier was
  // silently SKIPPED every time, falling straight through to the clock
  // heuristic below regardless of what the URL said, while the CLIENT (this
  // same `useState` initializer, re-run at hydration) DID see `window` and
  // honored the URL. Whenever the heuristic's answer differs from the URL's
  // — any evening visit to `/?moment=flow`, since the heuristic returns
  // "close" past 17:00 — the server rendered one moment's entire subtree
  // (e.g. Close) and the client rendered a different one (Flow), a
  // structural mismatch React reports as "Hydration failed ... the tree
  // will be regenerated on the client." `deepLink.moment` is the fix: it is
  // the SAME `deepLinkTargetFromParams(searchParams)` value on the server
  // (page.tsx computes it there) and on this very first client render
  // (Next.js hydrates with the identical server-resolved props), so
  // resolving through it FIRST keeps this tier answering identically in
  // both environments. The `window.location` read stays as a fallback
  // tier — still fully SSR-safe (it only ever matters when `deepLink` has
  // no `moment`, e.g. a test that mounts `TodayMoments` directly without
  // routing through `page.tsx`) — not removed, just demoted under the prop
  // that is actually available where this mismatch happened.
  const [resolvedInitialMoment] = useState<MomentValue>(() => {
    if (initialMoment) return initialMoment;
    if (deepLink?.moment) return deepLink.moment;
    if (typeof window !== "undefined") {
      const fromUrl = parseMomentParam(
        new URLSearchParams(window.location.search).get("moment"),
      );
      if (fromUrl) return fromUrl;
    }
    const stored = readStoredPreferences();
    if (stored?.moment) return stored.moment;
    return heuristicMoment(now, flowVM.currentBlock !== null);
  });
  const { moment, setMoment, adoptMomentFromUrl } = useMomentUrlState(
    resolvedInitialMoment,
  );
  // C2-S8 (#687 finding 1): the outbound push/pop half of the area
  // switcher's URL wiring — see useAreaUrlState.ts's own header for why the
  // initial resolution, mount self-heal and reconcile-correction all live in
  // WorkflowContext instead of here.
  const { setArea } = useAreaUrlState(setSelectedAreaId, state.areas);
  const [timeDisplay, setTimeDisplay] = useState<CountdownClockValue>(() => {
    const stored = readStoredPreferences();
    return stored?.timeDisplay ?? "countdown";
  });

  // C2-S7 (#687 finding 2): capture and palette are now URL-visible via the
  // same push/pop/adopt contract every sheet already has — see
  // useOverlayUrlState's own header for why closing needs to survive being
  // composed with another push (the palette can open capture or a sheet from
  // inside itself).
  const {
    open: captureOpen,
    openOverlay: openCapture,
    closeOverlay: closeCapture,
    adoptOverlayFromUrl: adoptCaptureFromUrl,
  } = useOverlayUrlState("capture");
  const [captureDraft, setCaptureDraft] = useState<string>(() =>
    readStoredCaptureDraft(),
  );
  const {
    open: paletteOpen,
    openOverlay: openPalette,
    closeOverlay: closePalette,
    adoptOverlayFromUrl: adoptPaletteFromUrl,
  } = useOverlayUrlState("palette");
  // C2 Target Card 2: the sheet is URL-visible and Back/Forward-correct.
  // `openSheet` pushes `?sheet=<value>`, `closeSheet` undoes exactly that,
  // and popstate re-reads the URL as the authority — see useSheetUrlState.
  const { activeSheet, openSheet, closeSheet, adoptSheetFromUrl } =
    useSheetUrlState();
  // C2-S8 hotfix (#687 finding 1, caught by the signed-in e2e tier —
  // areas-port-truth.spec.ts:211): AreasSheet's own click handler
  // (AreasSheet.tsx) calls `onSelectArea(areaId)` THEN `onClose()`
  // synchronously, in that order — the SAME "pick, then close" composition
  // useOverlayUrlState.ts's own docstring already documents for the command
  // palette. Wiring `onSelectArea` straight to the raw `setSelectedAreaId`
  // (as this used to) writes NOTHING to the URL; `onClose` → `closeSheet()`
  // then calls `history.back()` (this sheet DID push its own `?sheet=areas`
  // entry via `openSheet`), which is ASYNCHRONOUS — `popstate` fires on a
  // LATER task, landing on the entry from BEFORE the sheet opened, which
  // still names the AREA THAT WAS JUST REPLACED. `useAreaUrlState`'s
  // popstate handler is faithfully URL-authoritative (by design, matching
  // every other Back/Forward handler in this file) — it re-applies that
  // stale area, undoing the pick a beat after it happened. Screen showed
  // "All areas" after picking "Personal"; URL agreed with the screen (both
  // wrong), so this was never a URL-vs-screen disagreement — the pick
  // itself lost the race.
  //
  // Fix: fold "close the sheet" and "change area" into ONE `replaceState`,
  // never letting `closeSheet()`'s `back()` run for this path at all.
  // `adoptSheetFromUrl(null)` closes the sheet's REACT state and clears
  // `pushedRef` (the same "adopted, not pushed" branch `closeSheet` already
  // takes for a sheet reached by direct URL) — AreasSheet's own subsequent
  // `onClose()` call then finds `pushedRef.current` false and takes that
  // same safe `replaceState` branch too, a harmless no-op re-confirming
  // `sheet` is already absent. No `back()`, no popstate, no race.
  const handleAreasSheetSelectArea = useCallback(
    (areaId: string | null) => {
      setSelectedAreaId(areaId);
      adoptSheetFromUrl(null);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      params.delete("sheet");
      const search = params.toString();
      window.history.replaceState(
        null,
        "",
        urlWithArea(
          {
            pathname: window.location.pathname,
            search: search ? `?${search}` : "",
          },
          areaId,
        ),
      );
    },
    [setSelectedAreaId, adoptSheetFromUrl],
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // #581 (onboarding step 2): the day-shape preference, when the user has
  // saved one, feeds the default focus-session length used whenever a move
  // has no estimate of its own. No saved preference -> the pre-existing
  // 25-minute default, unchanged. Read once at mount (localStorage).
  const [fallbackFocusMinutes] = useState(
    () => readDayShapePreferences()?.sessionMinutes ?? DEFAULT_FOCUS_MINUTES,
  );

  const pipelineCounts = useMemo(
    () => buildPipelineCounts(state, selectedAreaId, { now }),
    [state, selectedAreaId, now],
  );

  useEffect(() => {
    writeStoredPreferences({ moment, timeDisplay });
  }, [moment, timeDisplay]);

  // #292 Stage-2 entry gate instrumentation: "brief viewed >= 4 days/week"
  // needs a signal on the surface a returning user actually sees daily —
  // the Start moment (S6 #258's "daily brief additions"), not only the rare
  // post-absence re-entry ritual (useReEntryRitual.ts already records its
  // own view separately). This fires once per local day the Start moment is
  // the actually-rendered surface (below: `moment === "start"` AND neither
  // the onboarding nor the re-entry ritual is standing in front of it,
  // mirroring the exact render condition below). Fire-and-forget and
  // failure-silent by construction (lib/reEntry/briefView.ts); demo mode
  // (no Supabase client) is skipped silently inside the recorder.
  const briefViewRecorderRef = useRef<BriefViewRecorder | null>(null);
  if (briefViewRecorderRef.current === null) {
    briefViewRecorderRef.current = createBriefViewRecorder();
  }
  const startMomentShowing =
    !onboardingActive &&
    !(ritualActive && ritual.summary && ritual.plan) &&
    moment === "start";
  useEffect(() => {
    if (!startMomentShowing) return;
    briefViewRecorderRef.current?.recordIfNeeded(
      createSupabaseBrowserClient(),
      now,
    );
  }, [startMomentShowing, now]);

  // FR-047 slice 2 / FR-033 (#686): the optional Close purpose-gauge check-in.
  // Read the last-checked local day once (localStorage, mount-only) so an
  // answered check-in stays hidden the rest of that day; gating itself lives
  // in the shipped `shouldOfferPurposeGaugeCheckin` policy wrapper. Recording
  // is fire-and-forget and skipped silently in demo mode.
  const [purposeGaugeLastChecked, setPurposeGaugeLastChecked] = useState<
    string | null
  >(() => readPurposeGaugeLastChecked());
  const purposeGaugeOffered = shouldOfferPurposeGaugeCheckin(
    now,
    purposeGaugeLastChecked,
  );
  const handlePurposeGaugeCheckIn = useCallback(
    (response: PurposeGaugeResponse) => {
      const checkedOn = localDayStamp(now);
      recordPurposeGaugeCheckinFireAndForget(
        createSupabaseBrowserClient(),
        checkedOn,
        response,
      );
      writePurposeGaugeLastChecked(checkedOn);
      setPurposeGaugeLastChecked(checkedOn);
    },
    [now],
  );

  // P6 deep-link shims: apply the incoming deepLink target exactly once. If
  // the re-entry ritual is active OR merely eligible-but-not-yet-latched
  // (ritual.pending — status still reads "idle" on the very first commit
  // before the mount effect flips it), defer application until the ritual
  // resolves rather than fighting it for the moment/overlay/sheet state —
  // the ritual owns the screen until dismissed. Gating on ritualActive
  // alone races: on mount, ritualActive is derived from status === "idle"
  // even when an absence is about to latch, so an overlay/sheet target
  // would pop on top of the ritual before its own effect has a chance to
  // run.
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (!deepLink) return;
    if (deepLinkAppliedRef.current) return;
    if (ritualActive || ritual.pending) return;
    if (onboardingActive || onboarding.pending) return;

    deepLinkAppliedRef.current = true;
    // The URL ALREADY carries this moment (the redirect shim put it there
    // before this component mounted) — adopt it without pushing a second,
    // redundant history entry. Mirrors `adoptSheetFromUrl` below.
    if (deepLink.moment) adoptMomentFromUrl(deepLink.moment);
    if (deepLink.overlay === "capture") adoptCaptureFromUrl(true);
    if (deepLink.overlay === "palette") adoptPaletteFromUrl(true);
    if (deepLink.sheet) adoptSheetFromUrl(deepLink.sheet);
  }, [
    deepLink,
    ritualActive,
    ritual.pending,
    onboardingActive,
    onboarding.pending,
    adoptSheetFromUrl,
    adoptMomentFromUrl,
    adoptCaptureFromUrl,
    adoptPaletteFromUrl,
  ]);

  // FR-027 (F-G1b) share target: text shared into the installed PWA lands on
  // the moments home as ?shared_text=. Open the capture overlay prefilled with
  // it exactly once (deferring to the re-entry ritual, same as deep links),
  // then strip the param so a refresh doesn't reopen it.
  //
  // C2-S7: the SAME replaceState now also WRITES `capture=1` (not just
  // strips `shared_text`) — otherwise this path would reintroduce the exact
  // URL-truth gap finding 2 exists to close, just from a different entry
  // point. `adoptCaptureFromUrl` (not `openCapture`) matches: the URL is
  // being set directly here, so there is nothing for the overlay hook's own
  // push to do.
  const sharedTextAppliedRef = useRef(false);
  useEffect(() => {
    if (sharedTextAppliedRef.current) return;
    if (ritualActive || ritual.pending) return;
    if (onboardingActive || onboarding.pending) return;
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared_text");
    if (!shared) return;

    sharedTextAppliedRef.current = true;
    setCaptureDraft(shared);
    writeStoredCaptureDraft(shared);
    adoptCaptureFromUrl(true);

    params.delete("shared_text");
    params.set("capture", "1");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }, [
    ritualActive,
    ritual.pending,
    onboardingActive,
    onboarding.pending,
    adoptCaptureFromUrl,
  ]);

  // C2-S7 (#687 finding 3, URL hygiene): an invalid `?sheet=`, `?capture=`
  // or `?palette=` value renders nothing — `deepLinkTargetFromParams`
  // already treats it exactly like an absent param, matching its own
  // documented precedence ("Unknown/absent params yield null (a plain home
  // visit)") — but the raw value was left sitting in the address bar
  // unexplained, so a refresh kept showing a URL that named a state the
  // screen never actually entered. Scrubbed via `replaceState`, once on
  // mount, independent of the ritual/onboarding gate above: there is no
  // legitimate application to defer for a value that was never valid in the
  // first place, so scrubbing it early cannot race a later real one. Never
  // grows history (replaceState only) and never touches a VALID value —
  // those stay owned by the deep-link effect above and the overlay/sheet
  // hooks' own popstate handling.
  //
  // C2-S8 (#687 finding 1) extends the same pass with `?area=`: unlike
  // sheet/capture/palette, an area id's validity is not knowable from its
  // shape alone (it's not a fixed enum) — it has to be checked against the
  // LIVE area list, which is why this needs `state.areas` where the other
  // three needed only their own static parsers. `state.areas` is available
  // synchronously on the very first render (the reducer's own initial state
  // always seeds it, mock or restored — never empty), so reading it here,
  // in this same mount-once pass, is safe.
  //
  // C2-S8 (#687 finding 2) extends it again for the one IMPOSSIBLE combo a
  // hand-crafted URL can name: `capture` and the command palette are
  // mutually exclusive overlays (`DeepLinkTarget.overlay` is one-or-the-
  // other by TYPE, and `deepLinkTargetFromParams`'s own `if`/`else if` gives
  // capture the win) — so `?capture=1&palette=1` only ever renders capture;
  // the palette never adopts. Left alone, `?palette=1` would keep sitting in
  // the address bar claiming a screen state that never happened. Scrubbed
  // the same way as an outright invalid value, because from the URL's own
  // truth-telling contract it IS one: capture's presence makes palette's
  // "1" un-appliable, exactly like a value `isSheetValue` rejects.
  const invalidParamsScrubbedRef = useRef(false);
  useEffect(() => {
    if (invalidParamsScrubbedRef.current) return;
    if (typeof window === "undefined") return;
    invalidParamsScrubbedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    let changed = false;

    const sheetParam = params.get("sheet");
    if (sheetParam !== null && !isSheetValue(sheetParam)) {
      params.delete("sheet");
      changed = true;
    }
    const captureParam = params.get("capture");
    const captureValid =
      captureParam !== null && parseOverlayParam(captureParam);
    if (captureParam !== null && !captureValid) {
      params.delete("capture");
      changed = true;
    }
    const paletteParam = params.get("palette");
    const paletteValid =
      paletteParam !== null && parseOverlayParam(paletteParam);
    if (paletteParam !== null && !paletteValid) {
      params.delete("palette");
      changed = true;
    } else if (captureValid && paletteValid) {
      // Impossible combo (finding 2) — capture wins, palette never renders.
      params.delete("palette");
      changed = true;
    }
    const areaParam = params.get("area");
    if (areaParam !== null) {
      const parsedArea = parseAreaParam(areaParam);
      const areaKnown =
        parsedArea === null || state.areas.some((a) => a.id === parsedArea);
      if (!areaKnown) {
        params.delete("area");
        changed = true;
      }
    }

    if (!changed) return;
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
    // Deliberately empty deps, matching the mount-once contract this effect
    // already documents above: `state.areas` is read from the closure of
    // the FIRST render only, which is fine — it is always already populated
    // by then (see the comment above) — and re-running this scrub on a
    // later areas change would fight the reconcile-and-correct logic
    // `lib/WorkflowContext.tsx` already owns for that case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // SP-6: back-compat signature — every existing call site passes a plain
  // string and keeps working unchanged (auto-dismisses at the original
  // 2.5s). An optional action extends the slot to a real, focusable Undo
  // button and the toast lingers longer (6s) to give it a fair chance to be
  // read and clicked before it auto-dismisses.
  const showToast = useCallback((message: string, action?: ToastAction) => {
    setToast({ message, action });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(
      () => {
        setToast(null);
      },
      action ? TOAST_WITH_ACTION_DURATION_MS : TOAST_DURATION_MS,
    );
  }, []);

  // #590 slice 3: Flow moment's focus-session + task-map wiring, extracted
  // to `useFlowFocusSession` (see its doc comment for the full contract).
  const {
    session,
    progressionNodes,
    focusedTask,
    taskMapDraftForSection,
    handleRequestTaskMapDraft,
    handleApproveTaskMapDraft,
    handleToggleTaskMapNodeCompletion,
    revisionOfferForSection,
    handleProposeRevision,
    handleDismissRevisionOffer,
    finishFocus,
    endSessionOpen,
    setEndSessionOpen,
    endSessionElapsedMinutes,
    handleEndSessionSave,
    pauseFocus,
    extendFocus,
    handleStartMove,
    handleReclaimDrift,
    handleAbandonDrift,
    hasActiveSession,
  } = useFlowFocusSession({
    state,
    now,
    startVM,
    fallbackFocusMinutes,
    showToast,
    setMoment,
    startTaskSession,
    markSession,
    deferTaskWithSession,
    taskMapDraft,
    requestTaskMapDraft,
    dismissTaskMapDraft,
    approveTaskMapDraft,
    toggleTaskMapNodeCompletion,
    updateTaskFirstTinyStep,
  });

  // Name the work, never a generic label — arriving at "Focus time is still
  // running · Untitled" tells the user nothing about whether to go back.
  const runningSessionTitle = useMemo(() => {
    const task = session.activeTaskId
      ? state.tasks.find((item) => item.id === session.activeTaskId)
      : null;
    return task?.title ?? flowVM.currentBlock?.title ?? "Your focus session";
  }, [session.activeTaskId, state.tasks, flowVM.currentBlock]);

  // #590 slice 3: Close moment's wins + rollup harvesting, extracted to
  // `useCloseMomentRollups` (see its doc comment for the full contract).
  const {
    pendingWins,
    confirmedWins,
    handleConfirmWin,
    handleSkipWin,
    approvedRollups,
    displayedRollups,
    handleApproveRollup,
    handleDismissRollup,
    handleToggleRollupProse,
    displayedMonthlyRollups,
    approvedMonthlyRollups,
    monthOverMonthReadback,
    handleApproveMonthlyRollup,
    handleDismissMonthlyRollup,
    handleToggleMonthlyRollupProse,
  } = useCloseMomentRollups({
    state,
    closeVM,
    now,
    showToast,
    confirmWin,
    confirmRollup,
    listApprovedRollups,
    journalledRollupKeys,
    workflowAreaIdByPersistedId,
    areasReadbackSettled,
  });

  // FR-031 slice F5 (#679): the single Close map-revision offer — kernel
  // decision latched per Close visit; tapping it is the only AI spend.
  // ONE-OFFER-PER-CLOSE precedence (#692): the FR-033 purpose-gauge check-in
  // wins when both qualify (it is time-boxed to rare sample days; a map
  // revision keeps until acted on and is also offered in Flow). Suppression
  // runs before the kernel, so the revision's daily cap is not spent unseen.
  const {
    offer: closeRevisionOffer,
    clearOffer: clearCloseRevisionOffer,
    dismissOffer: dismissCloseRevisionOffer,
  } = useTaskMapCloseRevisionOffer({
    state,
    active: moment === "close",
    suppressed: purposeGaugeOffered,
  });

  const closeTaskMapRevision = useMemo<CloseTaskMapRevisionVM | null>(() => {
    if (moment !== "close" || !closeRevisionOffer) {
      return null;
    }
    const task = state.tasks.find(
      (item) => item.id === closeRevisionOffer.taskId,
    );
    if (!task) {
      return null;
    }

    let currentGraph: TaskMapGraph | null = null;
    if (task.map_status === "approved" && task.progression_map) {
      const validated = validateTaskMapForPersistence(task.progression_map);
      if (validated.ok) {
        currentGraph = validated.graph as TaskMapGraph;
      }
    }

    const draftState: TaskMapDraftUiState =
      taskMapDraft.phase === "idle" ||
      taskMapDraft.taskId !== closeRevisionOffer.taskId
        ? { phase: "idle" }
        : taskMapDraft.phase === "pending"
          ? { phase: "pending" }
          : taskMapDraft.phase === "ready"
            ? { phase: "ready", draft: taskMapDraft.draft }
            : { phase: "failed", message: taskMapDraft.message };

    return {
      offer: {
        taskTitle: closeRevisionOffer.taskTitle,
        signals: closeRevisionOffer.signals,
      },
      draftState,
      currentGraph,
      onPropose: () => {
        void requestTaskMapDraft(closeRevisionOffer.taskId, {
          revisionSignals: closeRevisionOffer.signals,
        });
      },
      onDismissOffer: dismissCloseRevisionOffer,
      onApprove: (graph) => {
        clearCloseRevisionOffer();
        void approveTaskMapDraft(closeRevisionOffer.taskId, graph);
      },
      onDismissDraft: () => {
        clearCloseRevisionOffer();
        dismissTaskMapDraft();
      },
    };
  }, [
    moment,
    closeRevisionOffer,
    state.tasks,
    taskMapDraft,
    requestTaskMapDraft,
    approveTaskMapDraft,
    dismissTaskMapDraft,
    clearCloseRevisionOffer,
    dismissCloseRevisionOffer,
  ]);

  const handleDrillPipeline = useCallback(
    (stage: string) => {
      // C2-S3/S6 (#687): every pipeline-rail node now opens something real.
      // The old fallback — `showToast("Opens with the full shell")` — named a
      // shell that no longer exists once C2-S6 retires it; a control that
      // says it does something and does not is FINDING 1's defect class, so
      // there is no fallback left, only real destinations.
      if (stage === "triage") {
        openSheet("triage");
        return;
      }
      if (stage === "plan") {
        openSheet("plan");
        return;
      }
      if (stage === "review") {
        openSheet("review");
        return;
      }
      if (stage === "capture") {
        openCapture();
        return;
      }
      if (stage === "execute") {
        setMoment("flow");
        return;
      }
    },
    [openSheet, setMoment, openCapture],
  );

  // #588: the only close-day path in this shell. "Day closed" is reported
  // only after the review save actually persisted; local-only keeps the
  // recovery-oriented fallback truth; failure shows recovery copy and never
  // claims closure.
  //
  // Audit P0#4: a day already closed is not re-closed. The card no longer
  // renders the button once `closeVM.dayClose` exists, so the only way in is
  // the keyboard primary (Enter) — which used to be the second way to write a
  // duplicate row. It now re-states the verdict the user is already looking
  // at instead. `saveReview` guards again at the provider, and the database
  // guards again under that; this layer exists so the user gets an answer
  // rather than an error.
  const handleCloseDay = useCallback(() => {
    if (closeVM.dayClose) {
      showToast(
        closeVM.dayClose.savedToAccount
          ? "Today is already closed"
          : `Today is already closed — ${SAVED_ON_THIS_DEVICE_SHORT}`,
      );
      return;
    }
    void saveReview().then((result) => {
      if (result === "persisted") {
        showToast("Day closed");
        return;
      }
      if (result === "local-only") {
        showToast(`Day closed — ${SAVED_ON_THIS_DEVICE_SHORT}`);
        return;
      }
      showToast("Couldn't close the day — review not saved yet");
    });
  }, [closeVM.dayClose, saveReview, showToast]);

  const runPrimary = useCallback(() => {
    if (moment === "start") {
      if (startVM.firstMove) {
        handleStartMove(startVM.firstMove);
      }
      return;
    }
    if (moment === "flow") {
      if (session.activeTaskId !== null || session.total > 0) {
        finishFocus();
      }
      return;
    }
    handleCloseDay();
  }, [
    moment,
    startVM.firstMove,
    handleStartMove,
    session.activeTaskId,
    session.total,
    finishFocus,
    handleCloseDay,
  ]);

  // Ordering: palette -> capture -> sheet. In practice Escape while a sheet
  // is focused is handled by MomentSheet itself (mirroring how
  // CommandPalette/CaptureOverlay own their own Escape via onKeyDown on the
  // focused element, since useMomentKeyboard is disabled while any overlay
  // is open) — this function exists for parity with that ordering and as a
  // defensive fallback, not as the primary Escape path.
  const closeTopOverlay = useCallback(() => {
    if (paletteOpen) {
      closePalette();
      return;
    }
    if (captureOpen) {
      closeCapture();
      return;
    }
    if (activeSheet) {
      closeSheet();
    }
  }, [
    paletteOpen,
    captureOpen,
    activeSheet,
    closeSheet,
    closePalette,
    closeCapture,
  ]);

  // FR-028 recovery candidate derivation: deterministic, pure. Ordered list
  // = [stalest open task, then each planned task deferral], deduped by
  // taskId. "Something else" cycles the index; empty list -> null.
  const recoveryCandidates = useMemo<RecoveryCandidate[]>(() => {
    if (!ritual.summary || !ritual.plan) return [];

    const candidates: RecoveryCandidate[] = [];
    const seen = new Set<string>();

    if (ritual.summary.stalest && ritual.summary.stalest.kind === "task") {
      const { id, label } = ritual.summary.stalest;
      candidates.push({ taskId: id, title: label, why: "Oldest waiting" });
      seen.add(id);
    }

    for (const deferral of ritual.plan.taskDeferrals) {
      if (seen.has(deferral.taskId)) continue;
      seen.add(deferral.taskId);
      candidates.push({
        taskId: deferral.taskId,
        title: deferral.taskTitle ?? "Task",
        why: "Just moved to backlog",
      });
    }

    return candidates;
  }, [ritual.summary, ritual.plan]);

  const recovery: RecoveryCandidate | null =
    recoveryCandidates.length > 0
      ? recoveryCandidates[recoverySwapIndex % recoveryCandidates.length]
      : null;

  const handleAcceptRecovery = useCallback(
    (taskId: string) => {
      const task = state.tasks.find((item) => item.id === taskId);
      const wasBacklog = task ? task.status === "backlog" : false;
      if (wasBacklog) {
        promoteBacklogTask(taskId);
      }
      ritual.complete();
      setMoment("start");
      // SP-6: `deferTask` genuinely reverses `promoteBacklogTask` here — it
      // returns the task to backlog exactly where it started, cancelling no
      // blocks that didn't already exist (a backlog task has none). Only
      // wire the undo when the promotion actually ran; otherwise there is
      // nothing to reverse and Undo would be a lie.
      showToast(
        "Welcome back — first move queued",
        wasBacklog
          ? { label: "Undo", run: () => deferTask(taskId) }
          : undefined,
      );
    },
    [state.tasks, promoteBacklogTask, deferTask, ritual, showToast, setMoment],
  );

  const handleSwapRecovery = useCallback(() => {
    setRecoverySwapIndex((current) => current + 1);
  }, []);

  const handleDismissRitual = useCallback(() => {
    ritual.complete();
    showToast("Welcome back");
  }, [ritual, showToast]);

  // D-10 (#483): shared gate for the masthead's own guarded shortcuts (area
  // cycle "A", theme toggle "D") — identical expression to
  // useMomentKeyboard's `enabled` below, so neither shortcut can fire
  // behind a modal/ritual/onboarding, matching every other global shortcut
  // in this file.
  const topbarShortcutsEnabled =
    !captureOpen &&
    !paletteOpen &&
    !activeSheet &&
    !ritualActive &&
    !onboardingActive;

  useMomentKeyboard({
    onSwitchMoment: setMoment,
    onCapture: () => openCapture(),
    onPalette: () => openPalette(),
    onPrimary: runPrimary,
    onEscape: closeTopOverlay,
    enabled: topbarShortcutsEnabled,
  });

  const paletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      {
        id: "switch-start",
        label: "Switch to Start",
        hint: momentKeyLabel("switch-start"),
      },
      {
        id: "switch-flow",
        label: "Switch to Flow",
        hint: momentKeyLabel("switch-flow"),
      },
      {
        id: "switch-close",
        label: "Switch to Close",
        hint: momentKeyLabel("switch-close"),
      },
      {
        id: "open-capture",
        label: "Open capture",
        hint: momentKeyLabel("open-capture"),
      },
      { id: "open-triage", label: "Open triage" },
      { id: "open-plan", label: "Open plan" },
      // C2-S4: Health's only other way in is SideRail's "View area health →",
      // which lives inside the Start moment and stacks to the BOTTOM of the
      // page below 1024px (`StartMoment`'s
      // `lg:grid-cols-[minmax(0,1fr)_20rem]`). The palette is the one entry
      // that is the same distance away from every moment and every viewport,
      // which is what Target Card 2's "any screen in <=2 interactions" asks
      // for on a 390px screen.
      { id: "open-health", label: "Open health" },
      // C2-S5: same reasoning as "Open health" directly above -- SideRail
      // lives inside the Start moment and stacks to the BOTTOM of the page
      // below 1024px, so the palette is the entry that is the same distance
      // away at 390px as at 1440px.
      { id: "open-areas", label: "Open all areas" },
    ];
    if (moment === "start" && startVM.firstMove) {
      actions.push({ id: "start-first-move", label: "Start first move" });
    }
    if (session.activeTaskId !== null || session.total > 0) {
      actions.push({
        id: "focus-done",
        label: "Done — log it",
        hint: momentKeyLabel("primary-action"),
      });
      actions.push({
        id: "focus-pause",
        label: session.running ? "Pause focus" : "Resume focus",
      });
    }
    actions.push({
      id: "toggle-time",
      label:
        timeDisplay === "countdown"
          ? "Switch time display to clock"
          : "Switch time display to countdown",
    });
    // Audit P0#4: the palette stops offering an action the day no longer has.
    // Leaving it listed after the close would put the old, future-tense
    // promise back on screen in the one surface the card's verdict cannot
    // reach.
    if (moment === "close" && !closeVM.dayClose) {
      actions.push({
        id: "close-day",
        label: "Close the day",
        hint: momentKeyLabel("primary-action"),
      });
    }
    return actions;
  }, [
    moment,
    closeVM.dayClose,
    startVM.firstMove,
    session.activeTaskId,
    session.total,
    session.running,
    timeDisplay,
  ]);

  const runPaletteAction = useCallback(
    (id: string) => {
      switch (id) {
        case "switch-start":
          setMoment("start");
          break;
        case "switch-flow":
          setMoment("flow");
          break;
        case "switch-close":
          setMoment("close");
          break;
        case "open-capture":
          openCapture();
          break;
        case "open-triage":
          openSheet("triage");
          break;
        case "open-plan":
          openSheet("plan");
          break;
        case "open-health":
          openSheet("health");
          break;
        case "open-areas":
          openSheet("areas");
          break;
        case "start-first-move":
          if (startVM.firstMove) handleStartMove(startVM.firstMove);
          break;
        case "focus-done":
          finishFocus();
          break;
        case "focus-pause":
          pauseFocus();
          break;
        case "toggle-time":
          setTimeDisplay((current) =>
            current === "countdown" ? "clock" : "countdown",
          );
          break;
        case "close-day":
          handleCloseDay();
          break;
        default:
          break;
      }
    },
    [
      startVM.firstMove,
      handleStartMove,
      finishFocus,
      pauseFocus,
      handleCloseDay,
      setMoment,
      openSheet,
      openCapture,
    ],
  );

  return (
    <div className="grid gap-6" data-testid="today-moments" style={accentStyle}>
      {onboardingActive ? (
        // #581: the onboarding ritual stands in for the moments content the
        // same way the re-entry ritual does; completing (or skipping) it
        // unmounts onto the Start moment, where the #551 state-truth
        // surfaces show whatever was just captured.
        <OnboardingRitual
          onSubmit={(text, hook) =>
            submitCaptureText(text, selectedAreaId, hook)
          }
          onAreasPersisted={syncPersistedAreas}
          onComplete={(outcome) => {
            onboarding.complete();
            setMoment("start");
            showToast(
              outcome === "captured"
                ? "Captured — you're set up"
                : "You're set up",
            );
          }}
        />
      ) : ritualActive && ritual.summary && ritual.plan ? (
        <ReEntryRitual
          summary={ritual.summary}
          plan={ritual.plan}
          outcomes={ritual.outcomes}
          demoMode={ritual.demoMode}
          recovery={recovery}
          onAcceptRecovery={handleAcceptRecovery}
          onSwapRecovery={handleSwapRecovery}
          onDismiss={handleDismissRitual}
        />
      ) : (
        <>
          {/* D-10 (#483): one composed masthead bar — brand+date on the
              left, every control (moments, area, time display, theme,
              settings) in a single tightened-gap cluster on the right,
              replacing the previous two-separate-pills-plus-a-bare-link
              layout the audit flagged as "loose grouping" (finding #4).

              D-10 R2 (#483 round 2): round 1 shipped this as one
              `flex flex-wrap` row unconditionally. Below `sm` that meant
              *two* copies of the Start/Flow/Close switcher on screen at
              once (this row's MomentSwitcher plus the fixed BottomNavigator
              — "no taste argument for it") and, once that's fixed, a
              5-control row with nowhere to go but a ragged flex-wrap
              staircase (measured at 206px tall / 24% of a 390x844
              viewport, terminating at three different right edges). Fixed
              with a real two-part mobile composition instead of emergent
              wrapping:
              - Row 1 (always): brand + date.
              - Row 2 (mobile, `flex flex-col` below `sm`): only the two
                controls with no mobile equivalent anywhere else on the
                page — AreaSelector (which area's data you're looking at —
                context, not a preference) and MastheadThemeToggle (the
                ONLY theme control in the app; no settings-page fallback
                exists, so it can never be dropped from a viewport). Both
                already stayed under `sm:` visibility flags for nothing —
                they simply render.
              - MomentSwitcher and the Settings link are `hidden sm:contents`
                below `sm`: BottomNavigator already carries an identical
                moment switch and a Settings link into the thumb zone, so
                rendering them here too on mobile is the exact duplicate
                the critics flagged. `sm:contents` (not `sm:flex`/
                `sm:inline-flex`) means the wrapper itself never becomes a
                layout box at `sm`+ either — the wrapped control's own root
                participates in the row exactly as if unwrapped.
              - CountdownClockToggle is the same `hidden sm:contents` — a
                "minor display-FORMAT preference" (round-1 critic's own
                framing) is the one control this composition can't fit
                robustly next to a full-length area name on a 390px row
                without risking the staircase reappearing; FlowMoment
                already exposes its own time-display toggle for the one
                moment where the format matters most, and the desktop/
                tablet masthead keeps full access at `sm`+.
              At `sm`+ the whole header becomes one `sm:flex-row` line and
              every control renders — nothing is lost above the mobile
              breakpoint.

              Visual rank ("primary nav > context > preferences", per
              round-1 critics): a hairline divider now separates
              MomentSwitcher (the only accent-filled, i.e. primary, control
              in the bar) from the secondary cluster (Area/Countdown/Theme/
              Settings — context + preferences, deliberately quieter and
              visually one family). The divider itself is `sm:` only —
              MomentSwitcher isn't in the mobile row for it to divide from.

              Height lock: every control in the row is now height-locked to
              the same ~44-46px line (was a 57px/44px, 13px split — see
              MomentSwitcher.tsx/CountdownClockToggle.tsx's own comments for
              the `.workflow-shell__nav` root cause) via a tightened `gap-2`
              instead of the previous `gap-3`.

              R3-C (#483 round 3, Inter reflow): self-hosting Inter (wider
              metrics than the Segoe fallback) reopened the row-1 overflow
              round 2 had just barely closed — measured 18.41px over budget
              at desktop widths (732.13px needed vs 713.72px available) with
              the shortest demo area ("Main Job") selected, wrapping the
              Settings icon alone to a second line.

              First pass shaved only the secondary cluster (gap-2->gap-1.5,
              AreaSelector/CountdownClockToggle/MastheadThemeToggle each one
              padding step) and verified clean against that shortest-name
              case — but AreaSelector's rendered width scales with the
              selected area's name, and this demo data's own longer names
              ("Volunteer Work", "Side Project") still wrapped the row: the
              first pass's margin (~13.75px) was real but smaller than the
              width swing between the shortest and longest demo names
              (~50px), so it only ever covered the case it was measured
              against.

              Two more changes close the real (name-independent) gap:
              1. AreaSelector's label span caps at `max-w-[5rem]` (was
                 `max-w-[9rem]`, effectively never engaging for realistic
                 names) + `min-w-0` (a `truncate` span inside an
                 `inline-flex` button doesn't actually shrink below its own
                 content's width without it — flexbox's `min-width: auto`
                 default silently wins over `max-w` otherwise). This bounds
                 AreaSelector's contribution to the row regardless of how
                 long a real (user-created) area name is — verified
                 in-browser across all 4 demo areas, with margin, not just
                 the shortest one.
              2. MomentSwitcher and CountdownClockToggle each give up one
                 more padding step (`px-3`->`px-2.5` / `px-3`->`px-2`) to
                 fund that 80px label budget without also truncating the
                 common short-name case ("Main Job"/"Personal" both render
                 in full at this cap; only names longer than ~80px worth of
                 text truncate). CountdownClockToggle (the "quietest"
                 secondary control) absorbs the larger of the two cuts;
                 MomentSwitcher's is a small padding harmonization, not a
                 demotion — it's still the only accent-filled control and
                 remains by far the widest. */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-sm font-semibold tracking-tight">
                LifeOS · Today
              </span>
              {/* Finding #2: the masthead had no date. Derived from the
                  real `now` this component already threads through every
                  other time-aware surface — never a fixed/fake string. */}
              <span
                className="text-sm text-muted-foreground"
                data-testid="today-moments-date"
              >
                {formatMastheadDate(now)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div
                className="hidden sm:contents"
                data-testid="masthead-momentswitcher-slot"
              >
                <MomentSwitcher value={moment} onChange={setMoment} />
              </div>
              <span
                aria-hidden="true"
                data-testid="masthead-divider"
                className="hidden h-6 w-px shrink-0 bg-border sm:block"
              />
              {/* Finding #1: native <select> replaced by a custom pill
                  combobox — swatch + label + a real "A" kbd hint. */}
              <AreaSelector
                areas={state.areas}
                value={selectedAreaId}
                onChange={setArea}
                shortcutEnabled={topbarShortcutsEnabled}
              />
              <div
                className="hidden sm:contents"
                data-testid="masthead-countdowntoggle-slot"
              >
                <CountdownClockToggle
                  value={timeDisplay}
                  onChange={setTimeDisplay}
                />
              </div>
              {/* Finding #3: topbar theme toggle, wired to the existing
                  next-themes setup — a real "D" kbd hint. */}
              <MastheadThemeToggle shortcutEnabled={topbarShortcutsEnabled} />
              {/* #688: the auth door — a "Sign in" pill when signed out (or
                  a quiet who + sign-out when signed in), in the same pill
                  grammar as the cluster. Renders nothing when accounts aren't
                  set up here, so it never dead-ends. Kept visible at every
                  width (not `hidden sm:contents`) because being unable to find
                  sign-in was the reported bug. */}
              <AuthAffordance />
              {/* Finding #4: demoted from a bare text link to an
                  icon-weighted pill matching the rest of the cluster. */}
              <div
                className="hidden sm:contents"
                data-testid="masthead-settingslink-slot"
              >
                <Link
                  href="/settings/areas"
                  aria-label="Settings"
                  className={cn(
                    HIT_TARGET_MIN,
                    "rounded-full border border-border bg-muted/40 text-muted-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
                  )}
                  data-testid="moments-settings-link"
                >
                  <SettingsIcon className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </header>

          {/* #737 C1 S5: where the user's work is, STACKED under the masthead
              rather than inline in the control cluster above — that cluster's
              width budget is what overflowed at 390px when #736 tried to fit a
              sentence into it. Renders nothing at all when everything has
              reached the account. */}
          <MastheadSaveState status={syncStatus} />

          {moment !== "start" ? (
            <h1 className="sr-only">LifeOS Today</h1>
          ) : null}

          {/*
            #737 C1 card 6: leaving Flow never ends a session, so every other
            moment carries a persistent way back to it. Rendered above the
            moment body so it is the first thing found on arrival, and never
            on Flow itself — there the session IS the screen.
          */}
          {moment !== "flow" && hasActiveSession ? (
            <RunningSessionReturn
              title={runningSessionTitle}
              remaining={session.remaining}
              running={session.running}
              onReturn={() => setMoment("flow")}
            />
          ) : null}

          {moment === "start" ? (
            <StartMoment
              vm={startVM}
              timeDisplay={timeDisplay}
              now={now}
              onStartMove={handleStartMove}
              onSnooze={() => showToast("Snoozed 10m")}
              onSwap={() => showToast("Looking for something else")}
              /* C2-S4 (#687): this was a `router.push` to the legacy health
                 route — a jump clean out of the moments shell into the old
                 cockpit, which Target Card 2 forbids on both counts (the old
                 design renders; Back leaves the shell). Health is now a sheet
                 at `?sheet=health`, and `noLegacyRouteLinks.test.ts` now
                 forbids the old push from coming back. */
              onOpenHealth={() => openSheet("health")}
              /* C2-S5 (#687): the All-areas surface had NO way in from the
                 moments shell at all -- unlike Health, there was no legacy
                 push to re-point, so this is a new entry rather than a
                 redirect. SideRail's Areas card is where areas already live,
                 which makes it one interaction from the home. */
              onOpenAreas={() => openSheet("areas")}
              pipelineCounts={pipelineCounts}
              onDrillPipeline={handleDrillPipeline}
              onOpenRecovery={() => setMoment("close")}
              onOpenTriage={() => openSheet("triage")}
            />
          ) : null}

          {moment === "flow" ? (
            <FlowMoment
              vm={flowVM}
              session={session}
              timeDisplay={timeDisplay}
              onDone={finishFocus}
              onPause={pauseFocus}
              onExtend={extendFocus}
              onToggleTime={() =>
                setTimeDisplay((current) =>
                  current === "countdown" ? "clock" : "countdown",
                )
              }
              onReclaimDrift={handleReclaimDrift}
              onAbandonDrift={handleAbandonDrift}
              progressionNodes={progressionNodes}
              focusedTask={focusedTask}
              taskMapDraft={taskMapDraftForSection}
              now={now}
              onRequestTaskMapDraft={handleRequestTaskMapDraft}
              onDismissTaskMapDraft={dismissTaskMapDraft}
              onApproveTaskMapDraft={handleApproveTaskMapDraft}
              onToggleTaskMapNodeCompletion={handleToggleTaskMapNodeCompletion}
              taskMapRevisionOffer={revisionOfferForSection}
              onProposeTaskMapRevision={handleProposeRevision}
              onDismissTaskMapRevisionOffer={handleDismissRevisionOffer}
              firstTinyStep={focusedTask?.first_tiny_step ?? null}
              onUpdateFirstTinyStep={(value) => {
                if (!focusedTask) return;
                updateTaskFirstTinyStep(focusedTask.id, value);
              }}
            />
          ) : null}

          {moment === "close" ? (
            <CloseMoment
              vm={closeVM}
              pendingWins={pendingWins}
              confirmedWins={confirmedWins}
              pendingRollups={displayedRollups}
              approvedRollups={approvedRollups}
              onCloseDay={handleCloseDay}
              onCarryForward={(taskId) => carryForwardTask(taskId)}
              onConfirmWin={handleConfirmWin}
              onSkipWin={handleSkipWin}
              onApproveRollup={handleApproveRollup}
              onDismissRollup={handleDismissRollup}
              onToggleRollupProse={handleToggleRollupProse}
              pendingMonthlyRollups={displayedMonthlyRollups}
              approvedMonthlyRollups={approvedMonthlyRollups}
              monthOverMonthReadback={monthOverMonthReadback}
              onApproveMonthlyRollup={handleApproveMonthlyRollup}
              onDismissMonthlyRollup={handleDismissMonthlyRollup}
              onToggleMonthlyRollupProse={handleToggleMonthlyRollupProse}
              purposeGaugeOffered={purposeGaugeOffered}
              onPurposeGaugeCheckIn={handlePurposeGaugeCheckIn}
              taskMapRevision={closeTaskMapRevision}
            />
          ) : null}
        </>
      )}

      <KeyboardLegend />

      {/* #703: capture is never blocked. It used to be disabled while a
          parse was in flight; parsing now happens in triage, and a sort
          running there must never stop you writing down a new thought. */}
      <CaptureAffordance
        onOpen={() => openCapture()}
        unsyncedCount={unsyncedCaptureCount}
      />

      {/* #574: <640px only (BottomNavigator itself is `sm:hidden`) — the
          Start/Flow/Close switch + Settings, reachable in the thumb zone
          without scrolling to the header. Rendered unconditionally
          (matching CaptureAffordance just above), including while the
          re-entry ritual is active: it's a fixed low-risk nav strip, not
          part of the ritual's own flow, and hiding it would just be one
          more state to track for no real benefit.
          #593: it also carries the mobile capture action (same state as the
          desktop pill above, which is `hidden` below `sm`). */}
      <BottomNavigator
        value={moment}
        onChange={setMoment}
        onCapture={() => openCapture()}
        unsyncedCount={unsyncedCaptureCount}
        onOpenPalette={() => openPalette()}
      />

      <CaptureOverlay
        open={captureOpen}
        initialText={captureDraft}
        onDraftChange={(text) => {
          setCaptureDraft(text);
          writeStoredCaptureDraft(text);
        }}
        onSave={(text, returnHook) =>
          submitCaptureText(text, selectedAreaId, returnHook)
        }
        onResolved={() => {
          // #556: the success toast only fires once the capture truly
          // entered the pipeline — never ahead of that truth.
          // #689: the toast names WHERE the thought went and offers the
          // one-tap path there. Every capture is visible in the triage
          // sheet as an unsorted-capture row, except the offline queue: a
          // capture saved while offline stays on the device until reconnect
          // (FR-027), so the message says that instead of promising a
          // triage row that isn't there yet.
          // #703: capture is now a single raw-save path (the parse moved to
          // triage's Sort action), so there is no longer a "parsed" outcome
          // to branch on here — the offline case is simply "offline".
          const offline =
            typeof navigator !== "undefined" && navigator.onLine === false;
          // #737 C1 S5 — WAS " Saved on this device — sign in to keep it
          // everywhere.", and that was false. A signed-out capture made while
          // ONLINE never reaches a device store: `submitCaptureText` only
          // routes to the durable queue when `navigator.onLine === false`, so
          // this one is staged in the reducer and mirrored to per-TAB
          // sessionStorage. It survives a reload and dies with the tab.
          //
          // The words now say the narrower true thing. Widening them back is
          // earned by making the capture durable (Target Card 3), not by
          // rephrasing — see the AGENT-TODO on this slice's PR.
          const signedOutNote = syncStatus.signedOut
            ? " Sign in to keep it — until then it's only in this tab."
            : "";
          if (offline) {
            showToast(
              "Captured — saved on this device. It joins your triage pile when you're back online.",
            );
          } else {
            showToast(`Captured — it's in your triage pile.${signedOutNote}`, {
              label: "Open triage",
              run: () => openSheet("triage"),
            });
          }
          closeCapture();
          // Clear the draft only after a successful save — Esc/close must
          // preserve it, so this write happens nowhere else.
          setCaptureDraft("");
          writeStoredCaptureDraft("");
        }}
        onClose={() => closeCapture()}
      />

      <CommandPalette
        open={paletteOpen}
        actions={paletteActions}
        onRun={runPaletteAction}
        onClose={() => closePalette()}
      />

      <TriageSheet
        open={activeSheet === "triage"}
        selectedAreaId={selectedAreaId}
        onClose={() => closeSheet()}
      />

      <PlanSheet
        open={activeSheet === "plan"}
        onClose={() => closeSheet()}
        selectedAreaId={selectedAreaId}
        blocks={startVM.blocks}
        timeDisplay={timeDisplay}
        now={now}
        onToast={showToast}
      />

      {/* C2-S3: the day-close truth is passed IN. `handleCloseDay` is the one
          close path in this shell (its own comment says so) and `closeVM`
          holds C1's verdict, so the sheet renders both and owns neither. */}
      <ReviewSheet
        open={activeSheet === "review"}
        onClose={() => closeSheet()}
        selectedAreaId={selectedAreaId}
        now={now}
        dayClose={closeVM.dayClose}
        onCloseDay={handleCloseDay}
        onToast={showToast}
      />

      {/* C2-S4: the system check runs when this sheet OPENS, not when the home
          renders — see HealthSheet's doc comment. Mounting it here (the shape
          every sheet uses) is what makes that gate necessary and deliberate. */}
      <HealthSheet
        open={activeSheet === "health"}
        onClose={() => closeSheet()}
        selectedAreaId={selectedAreaId}
        now={now}
      />

      {/* C2-S5: mounted like every other sheet (`open` is a prop, not a mount
          condition). AreasSheet is hook-free while closed for the reason S4
          measured -- see its doc comment. */}
      <AreasSheet
        open={activeSheet === "areas"}
        onClose={() => closeSheet()}
        selectedAreaId={selectedAreaId}
        onSelectArea={handleAreasSheetSelectArea}
      />

      <EndSessionSheet
        open={endSessionOpen}
        taskTitle={
          focusedTask?.title ?? flowVM.currentBlock?.title ?? "Focus session"
        }
        elapsedMinutes={endSessionElapsedMinutes}
        onCancel={() => setEndSessionOpen(false)}
        onSave={handleEndSessionSave}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2"
        data-testid="today-moments-toast"
      >
        {toast ? (
          <div
            className={
              "flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg motion-reduce:transition-none motion-reduce:duration-0" +
              (toast.action ? " pointer-events-auto" : "")
            }
            style={{
              transitionProperty: "opacity, transform",
              transitionDuration: "var(--motion-base)",
              transitionTimingFunction: "var(--motion-ease)",
            }}
          >
            {toast.message}
            {toast.action ? (
              <button
                type="button"
                // SP-6: a real, focusable button — but never auto-focused.
                // Undo is there for the hand that wants it, not forced on
                // the eye that doesn't.
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                  if (toastTimeoutRef.current) {
                    clearTimeout(toastTimeoutRef.current);
                  }
                }}
                className="font-semibold text-primary underline-offset-2 hover:underline"
                data-testid="today-moments-toast-undo"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
