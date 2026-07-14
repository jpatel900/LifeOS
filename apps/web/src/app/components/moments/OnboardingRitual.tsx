"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Area } from "@lifeos/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CaptureParseState } from "@/lib/WorkflowContext";
import {
  createArea,
  listAreas,
  softDeleteArea,
  updateAreaColor,
} from "@/lib/data/workflow";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AREA_COLOR_PRESETS, buildAreaAccentStyle } from "@/lib/areaAccent";
import {
  DEFAULT_DAY_SHAPE,
  SESSION_LENGTH_OPTIONS,
  writeDayShapePreferences,
  type SessionLengthMinutes,
} from "@/lib/onboarding/onboarding";
import { CaptureCore } from "./CaptureCore";
import { useFocusTrap } from "./useFocusTrap";
import { useReturnFocus } from "./useReturnFocus";

/**
 * #581 (epic #555 item 7) — the three-step onboarding ritual.
 *
 * One screen per step, every step skippable, calm: (1) areas as prefilled
 * editable chips; (2) day shape (work window + session length) with a quiet
 * optional Google Calendar link-out; (3) first capture through the SHARED
 * CaptureCore (FR-026 containment semantics — composed, never reimplemented).
 * The ritual ends by unmounting onto the moments home, where the #551/#563
 * state-truth surfaces (hero + pending-triage badge) show the captured
 * thought — the payoff moment is the existing home telling the truth, not a
 * success screen of this component's own.
 *
 * Persistence goes through the EXISTING paths only: areas via the
 * lib/data/workflow area functions (Supabase or mock fallback — the exact
 * calls the areas settings page makes), the capture via the host-wired
 * WorkflowContext submit functions, and day-shape preferences via the
 * device-local record in lib/onboarding/onboarding.ts (the repo has no
 * server-side preference home — documented there). No new tables.
 *
 * Skip semantics (design note: "skip = keep defaults"): skipping step 1
 * persists the PRISTINE default areas (so the account is never left
 * area-less and the zero-state trigger can never re-fire); skipping step 2
 * writes nothing (the app's existing defaults stay in effect); skipping
 * step 3 completes the ritual without a capture.
 *
 * Rename note: renaming is fully supported for chips that do not exist yet
 * (the entire zero-state first-run path). On a Settings-triggered rerun,
 * chips backed by already-persisted areas keep their saved name — the data
 * layer has no rename operation today — while color, delete, and add all
 * work against the existing functions.
 */

export type OnboardingOutcome = "captured" | "skipped";

interface AreaChip {
  key: string;
  name: string;
  color: string;
  /** Persisted row backing this chip (rerun case); null = not created yet. */
  existing: Area | null;
}

// Colors come from the shared preset palette (G-UX-3: no raw hex literals
// in components) — Ocean / Forest / Clay, matching the seeded demo areas.
function presetValue(label: string): string {
  return (
    AREA_COLOR_PRESETS.find((preset) => preset.label === label)?.value ??
    AREA_COLOR_PRESETS[0].value
  );
}

const DEFAULT_AREA_CHIPS: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Main Job", color: presetValue("Ocean") },
  { name: "Personal", color: presetValue("Forest") },
  { name: "Side Project", color: presetValue("Clay") },
];

function defaultChips(): AreaChip[] {
  return DEFAULT_AREA_CHIPS.map((chip, index) => ({
    key: `default-${index}`,
    name: chip.name,
    color: chip.color,
    existing: null,
  }));
}

function nextPresetColor(current: string): string {
  const index = AREA_COLOR_PRESETS.findIndex(
    (preset) => preset.value === current,
  );
  const next = (index + 1) % AREA_COLOR_PRESETS.length;
  return AREA_COLOR_PRESETS[next].value;
}

function presetLabel(color: string): string {
  return (
    AREA_COLOR_PRESETS.find((preset) => preset.value === color)?.label ??
    "Custom"
  );
}

// #592: raw persistence errors (Supabase error text, network failures, etc.)
// are diagnostics-only — logged to the console, never rendered. The user
// sees one sanitized, recovery-oriented message that states the blast
// radius (nothing was lost) and the two ways forward, matching the
// established canned-copy pattern in GoogleCalendarConnectionPanel's
// normalizePanelFailure.
const AREA_PERSIST_FAILURE_MESSAGE =
  "Areas could not be saved right now. Nothing was lost — you can retry, or skip and set areas up later in Settings.";

const WORK_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function formatHour(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

export interface OnboardingRitualProps {
  captureParse: CaptureParseState;
  onSubmitParse(text: string, returnHook: string | null): void;
  onSubmitRaw(text: string, returnHook: string | null): void;
  onRetryWithMock(): void;
  /** Host wires this to WorkflowContext's syncPersistedAreas. */
  onAreasPersisted(areas: Area[]): void;
  onComplete(outcome: OnboardingOutcome): void;
}

type StepId = "areas" | "day" | "capture";

type PersistState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string };

export function OnboardingRitual({
  captureParse,
  onSubmitParse,
  onSubmitRaw,
  onRetryWithMock,
  onAreasPersisted,
  onComplete,
}: OnboardingRitualProps) {
  const [step, setStep] = useState<StepId>("areas");
  const [chips, setChips] = useState<AreaChip[]>(defaultChips);
  const [persistState, setPersistState] = useState<PersistState>({
    status: "idle",
  });
  const [workStartHour, setWorkStartHour] = useState(
    DEFAULT_DAY_SHAPE.workStartHour,
  );
  const [workEndHour, setWorkEndHour] = useState(DEFAULT_DAY_SHAPE.workEndHour);
  const [sessionMinutes, setSessionMinutes] = useState<SessionLengthMinutes>(
    DEFAULT_DAY_SHAPE.sessionMinutes,
  );
  const existingAreasRef = useRef<Area[]>([]);
  // The pristine prefill — what "Skip — keep the defaults" persists. For a
  // zero-state account this is the three default chips; on a Settings rerun
  // it is the account's existing areas (skipping a rerun must never delete
  // anything).
  const prefilledChipsRef = useRef<AreaChip[]>(defaultChips());
  const chipKeyCounter = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Same screen-ownership posture as ReEntryRitual: mounted = active.
  useReturnFocus(true);
  useFocusTrap(true, containerRef);

  // Rerun case: prefill chips from the areas that already exist so the
  // ritual edits reality instead of proposing duplicates. Zero-state
  // accounts get the defaults (Supabase returns no rows; the demo data
  // layer's seeded mock areas are matched by name at persist time instead,
  // so the default chips stay editable there).
  useEffect(() => {
    let cancelled = false;

    async function loadExisting() {
      try {
        const result = await listAreas(createSupabaseBrowserClient());
        if (cancelled) return;
        existingAreasRef.current = result.areas;
        if (result.provider === "supabase" && result.areas.length > 0) {
          const existingChips = result.areas.map((area) => ({
            key: `existing-${area.id}`,
            name: area.name,
            color: area.color ?? AREA_COLOR_PRESETS[0].value,
            existing: area,
          }));
          prefilledChipsRef.current = existingChips;
          setChips(existingChips);
        }
      } catch {
        // Areas could not load — the default chips remain, and persisting
        // will surface any real failure with a retry path.
      }
    }

    void loadExisting();

    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedChips = useMemo(
    () =>
      chips
        .map((chip) => ({ ...chip, name: chip.name.trim() }))
        .filter((chip) => chip.name.length > 0),
    [chips],
  );

  async function persistAreaChips(chipsToPersist: AreaChip[]): Promise<void> {
    const client = createSupabaseBrowserClient();
    const existing = existingAreasRef.current;
    const finalAreas: Area[] = [];
    const keptExistingIds = new Set<string>();

    for (const chip of chipsToPersist) {
      const match =
        chip.existing ??
        existing.find(
          (area) => area.name.toLowerCase() === chip.name.toLowerCase(),
        ) ??
        null;

      if (match) {
        keptExistingIds.add(match.id);
        if (chip.color !== (match.color ?? "")) {
          const updated = await updateAreaColor(client, {
            area_id: match.id,
            color: chip.color,
          });
          finalAreas.push(updated.area);
        } else {
          finalAreas.push(match);
        }
        continue;
      }

      const created = await createArea(client, {
        name: chip.name,
        description: null,
        color: chip.color,
      });
      finalAreas.push(created.area);
    }

    // Rerun case only: chips the user removed that are backed by persisted
    // rows go through the existing soft-delete (never a hard delete).
    const deletedIds = new Set<string>();
    for (const area of existing) {
      const chipBacked = chipsToPersist.some(
        (chip) => chip.existing?.id === area.id,
      );
      const wasPrefilled = chips.some((chip) => chip.existing?.id === area.id);
      if (!chipBacked && wasPrefilled && !keptExistingIds.has(area.id)) {
        await softDeleteArea(client, { area_id: area.id });
        deletedIds.add(area.id);
      }
    }

    // syncPersistedAreas REPLACES the workflow area list, so surviving
    // existing areas the chips never covered (mock/demo prefill uses the
    // defaults, not the account's rows) must ride along or they silently
    // vanish from the cockpit until reload — violating "nothing is deleted".
    for (const area of existing) {
      if (!keptExistingIds.has(area.id) && !deletedIds.has(area.id)) {
        finalAreas.push(area);
      }
    }

    onAreasPersisted(finalAreas);
  }

  async function handleAreasSubmit(chipsToPersist: AreaChip[]) {
    setPersistState({ status: "saving" });
    try {
      await persistAreaChips(chipsToPersist);
      setPersistState({ status: "idle" });
      setStep("day");
    } catch (error) {
      // Diagnostics-only: the raw error (Supabase message, network failure,
      // etc.) is never rendered to the user — see AREA_PERSIST_FAILURE_MESSAGE.
      console.error("[OnboardingRitual] area persistence failed", error);
      setPersistState({
        status: "error",
        message: AREA_PERSIST_FAILURE_MESSAGE,
      });
    }
  }

  function handleRenameChip(key: string, name: string) {
    setChips((current) =>
      current.map((chip) => (chip.key === key ? { ...chip, name } : chip)),
    );
  }

  function handleCycleColor(key: string) {
    setChips((current) =>
      current.map((chip) =>
        chip.key === key
          ? { ...chip, color: nextPresetColor(chip.color) }
          : chip,
      ),
    );
  }

  function handleRemoveChip(key: string) {
    setChips((current) => current.filter((chip) => chip.key !== key));
  }

  function handleAddChip() {
    chipKeyCounter.current += 1;
    const color =
      AREA_COLOR_PRESETS[chipKeyCounter.current % AREA_COLOR_PRESETS.length]
        .value;
    setChips((current) => [
      ...current,
      {
        key: `added-${chipKeyCounter.current}`,
        name: "",
        color,
        existing: null,
      },
    ]);
  }

  function handleDayContinue() {
    writeDayShapePreferences({
      workStartHour,
      workEndHour,
      sessionMinutes,
    });
    setStep("capture");
  }

  const saving = persistState.status === "saving";
  const stepNumber = step === "areas" ? 1 : step === "day" ? 2 : 3;

  return (
    <div
      ref={containerRef}
      className="mx-auto grid w-full max-w-xl gap-6"
      data-testid="onboarding-ritual"
    >
      <div className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Setup · step {stepNumber} of 3
        </p>
        <h1 className="workflow-surface-title text-xl font-semibold">
          {step === "areas"
            ? "Your areas"
            : step === "day"
              ? "Your day"
              : "One thought to start"}
        </h1>
      </div>

      {step === "areas" ? (
        <section className="grid gap-4" data-testid="onboarding-step-areas">
          <p className="text-sm text-muted-foreground">
            Everything in LifeOS lives in an area. Rename these, remove what you
            don&rsquo;t need, add your own.
          </p>

          <ul className="grid gap-2">
            {chips.map((chip) => (
              <li key={chip.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCycleColor(chip.key)}
                  disabled={saving}
                  aria-label={`Change color for ${chip.name || "new area"} (now ${presetLabel(chip.color)})`}
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card"
                  data-testid="onboarding-area-color"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 rounded-full bg-[var(--area-accent)]"
                    style={buildAreaAccentStyle(chip.color)}
                  />
                </button>
                <Input
                  value={chip.name}
                  onChange={(event) =>
                    handleRenameChip(chip.key, event.target.value)
                  }
                  readOnly={chip.existing !== null}
                  disabled={saving}
                  placeholder="Area name"
                  aria-label="Area name"
                  data-testid="onboarding-area-name"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveChip(chip.key)}
                  disabled={saving}
                  aria-label={`Remove ${chip.name || "new area"}`}
                  data-testid="onboarding-area-remove"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>

          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddChip}
              disabled={saving}
              data-testid="onboarding-area-add"
            >
              Add area
            </Button>
          </div>

          {persistState.status === "error" ? (
            <p
              role="alert"
              className="text-sm text-muted-foreground"
              data-testid="onboarding-areas-error"
            >
              {persistState.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleAreasSubmit(prefilledChipsRef.current)}
              disabled={saving}
              data-testid="onboarding-areas-skip"
            >
              Skip — keep the defaults
            </Button>
            <Button
              type="button"
              onClick={() => void handleAreasSubmit(trimmedChips)}
              disabled={saving || trimmedChips.length === 0}
              data-testid="onboarding-areas-continue"
            >
              {saving ? "Saving..." : "Continue"}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "day" ? (
        <section className="grid gap-4" data-testid="onboarding-step-day">
          <p className="text-sm text-muted-foreground">
            This shapes how much LifeOS suggests per day.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Work starts
              <select
                value={workStartHour}
                onChange={(event) =>
                  setWorkStartHour(Number(event.target.value))
                }
                className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground"
                data-testid="onboarding-day-start"
              >
                {WORK_HOURS.map((hour) => (
                  <option
                    key={hour}
                    value={hour}
                    disabled={hour >= workEndHour}
                  >
                    {formatHour(hour)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Work ends
              <select
                value={workEndHour}
                onChange={(event) => setWorkEndHour(Number(event.target.value))}
                className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground"
                data-testid="onboarding-day-end"
              >
                {WORK_HOURS.map((hour) => (
                  <option
                    key={hour}
                    value={hour}
                    disabled={hour <= workStartHour}
                  >
                    {formatHour(hour)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Focus session length
            </p>
            <div className="flex flex-wrap gap-2">
              {SESSION_LENGTH_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setSessionMinutes(minutes)}
                  className={cn(
                    "min-h-10 rounded-full border px-4 text-sm font-semibold",
                    sessionMinutes === minutes
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-input text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={sessionMinutes === minutes}
                  data-testid={`onboarding-session-${minutes}`}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Optional:{" "}
            <Link
              href="/settings/areas"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
              data-testid="onboarding-calendar-link"
            >
              connect Google Calendar in Settings
            </Link>{" "}
            — LifeOS only ever writes to it with your explicit approval.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("capture")}
              data-testid="onboarding-day-skip"
            >
              Skip — keep the defaults
            </Button>
            <Button
              type="button"
              onClick={handleDayContinue}
              data-testid="onboarding-day-continue"
            >
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === "capture" ? (
        <section className="grid gap-4" data-testid="onboarding-step-capture">
          <p className="text-sm text-muted-foreground">
            Capture one thought and watch it land on your home — that&rsquo;s
            the whole loop.
          </p>

          <CaptureCore
            mode="parse"
            placeholder="What's on your mind right now?"
            showReturnHook={false}
            captureParse={captureParse}
            onSubmitParse={onSubmitParse}
            onSubmitRaw={onSubmitRaw}
            onRetryWithMock={onRetryWithMock}
            onResolved={() => onComplete("captured")}
            saveLabel="Capture it"
            testIdPrefix="onboarding-capture"
          />

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onComplete("skipped")}
              data-testid="onboarding-capture-skip"
            >
              Skip for now
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
