"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import type { CaptureParseState } from "@/lib/WorkflowContext";
import {
  HIT_TARGET_INVISIBLE,
  HIT_TARGET_MIN,
  HIT_TARGET_ROW,
} from "./hitTarget";

/**
 * #556 (FR-026 capture containment) — the ONE capture widget shared by all
 * three capture surfaces: the moments-home overlay (CaptureOverlay.tsx wraps
 * this in dialog chrome), the /capture route (CaptureView in
 * LifeOSCockpit.tsx wraps this in page chrome), and the Execute side-capture
 * rail (wraps this with `mode="raw-only"` compact — see the #556 report for
 * why side-capture is allowed to skip the parse-wait entirely).
 *
 * Owns: the raw text + return-hook fields, the raw-first save action, the
 * parse-wait containment sequence (raw text + hook stay visible through the
 * wait; no second submit is possible; a failed parse offers a synchronous
 * mock-retry or "keep as raw" choice — never fire-and-forget), and the
 * closing "back to: <hook>" conclusion. Kind chips (Task/Note/Idea) are
 * removed here, not reimplemented: the schema has no field they ever fed
 * (CaptureItemSchema carries no "kind"/task-type-hint column, and
 * requestParseCapture has no parameter for one), so they were cosmetic from
 * day one. Threading a real hint through the parse contract is a schema +
 * prompt change out of scope for a containment fix; removing them is the
 * smallest safe change (see #556 report).
 *
 * Deliberately does NOT key off a per-capture id: it tracks the single
 * global `captureParse` phase from WorkflowContext instead. This keeps it
 * correct against both `submitCaptureText`'s current `void`-returning
 * signature and #565's coming `string | null`-returning one (Codex-owned,
 * WorkflowContext.tsx is out of scope here) — this component never reads
 * that return value. It only ever watches its own submit through to
 * resolution while `locked`, and containment guarantees only one
 * parse-mode capture is ever in flight at a time (a second submit, and a
 * close/unmount, are both blocked while waiting), so there is nothing to
 * disambiguate by id.
 */

export type CaptureCoreMode = "parse" | "raw-only";
export type CaptureCoreOutcome = "parsed" | "raw" | "failed-raw";

type CorePhase =
  | { kind: "idle" }
  | { kind: "waiting" }
  | {
      kind: "degraded";
      message: string;
      canRetryWithMock: boolean;
    }
  | { kind: "conclusion"; hookLabel: string; outcome: CaptureCoreOutcome };

export interface CaptureCoreProps {
  mode: CaptureCoreMode;
  compact?: boolean;
  initialText?: string;
  placeholder?: string;
  autoFocus?: boolean;
  showReturnHook?: boolean;
  onDraftChange?(text: string): void;
  // Starts (or offline-queues) the parse. Any return value is ignored — see
  // the module comment above for why. Required when mode="parse".
  onSubmitParse?(text: string, returnHook: string | null): void;
  onSubmitRaw(text: string, returnHook: string | null): void;
  // Global parse status from WorkflowContext. Required when mode="parse".
  captureParse?: CaptureParseState;
  onRetryWithMock?(): void;
  // Fires once the containment sequence concludes (parsed, raw, or a
  // degraded parse accepted as raw) — the caller closes/navigates here, not
  // before, so a success signal is never shown ahead of truth.
  onResolved?(outcome: CaptureCoreOutcome): void;
  // Escape/close while idle only — swallowed while a parse is in flight so
  // the user can't abandon the return-hook context mid-wait.
  onCancel?(): void;
  // Reports whether a new capture may begin right now — false for the
  // entire waiting/degraded/conclusion sequence. Lets chrome around this
  // core (e.g. CaptureOverlay's Close button) disable itself in step,
  // without duplicating the phase state machine.
  onLockChange?(locked: boolean): void;
  saveLabel?: string;
  saveRawLabel?: string;
  hint?: string;
  disabledReason?: string | null;
  testIdPrefix?: string;
  className?: string;
  // "enter": bare Enter saves, Shift+Enter is the newline escape hatch
  // (moments overlay, Execute side-capture — short single-thought fields).
  // "mod-enter": Cmd/Ctrl+Enter saves, bare Enter is a normal newline (the
  // /capture route's full multi-line composer).
  submitShortcut?: "enter" | "mod-enter";
  // Lets a surface with its own hero-textarea styling (the /capture page's
  // large borderless composer) override the default ui/textarea chrome
  // without forking the containment logic that owns it.
  textareaClassName?: string;
  // LifeOSCockpit uses its own `--btn`/`--acc` cockpit theme tokens (scoped
  // under `.lifeos-cockpit[data-theme]`), separate from the shadcn
  // `--primary`/`--muted` tokens this component defaults to — override so
  // the buttons follow whichever surface's theme they're embedded in.
  saveButtonClassName?: string;
  saveRawButtonClassName?: string;
}

const DEFAULT_HOOK_LABEL = "what you were doing";
// #591: 450ms was not a materially perceivable dwell — the "back to: <hook>"
// conclusion could auto-dismiss before a person had time to read it. This
// matches TOAST_DURATION_MS (TodayMoments.tsx), the reviewed standard this
// codebase already uses for a non-actionable, non-blocking auto-dismiss.
// The conclusion is never *only* reachable by waiting it out, though:
// clicking it, or pressing Enter/Escape while it's shown, dismisses it
// immediately (see handleKeyDown and the onClick below) — the dwell is a
// ceiling on how long a capture can be blocked, not the only way out.
const CONCLUSION_AUTO_DISMISS_MS = 2500;

export function CaptureCore({
  mode,
  compact = false,
  initialText,
  placeholder = "What's on your mind?",
  autoFocus = true,
  showReturnHook = mode === "parse" && !compact,
  onDraftChange,
  onSubmitParse,
  onSubmitRaw,
  captureParse,
  onRetryWithMock,
  onResolved,
  onCancel,
  onLockChange,
  // #689 scope add (owner): the old "Save raw" vs "Save thought" pair was a
  // front-door fork nobody could tell apart. Both persist the identical capture item
  // (stageAndPersistRawCapture); the ONLY difference is whether the AI
  // sorts it into a task draft now or later at triage. The labels now say
  // exactly that, in the same "sort" vocabulary the triage sheet uses.
  // Collapsing to a single button is an OWNER-GATE on the PR (it would
  // change ratified FR-026 containment behavior).
  saveLabel = "Save and sort",
  saveRawLabel = "Save as-is, sort later",
  hint,
  disabledReason,
  testIdPrefix = "capture",
  className,
  submitShortcut = "enter",
  textareaClassName,
  saveButtonClassName,
  saveRawButtonClassName,
}: CaptureCoreProps) {
  const [text, setText] = useState(initialText ?? "");
  const [returnHook, setReturnHook] = useState("");
  const [phase, setPhase] = useState<CorePhase>({ kind: "idle" });
  // SP-5: a non-empty initialText means a draft was restored from
  // sessionStorage (TodayMoments owns the read) — computed once at mount so
  // it reflects the seed, not every subsequent keystroke.
  const [restored] = useState(() =>
    Boolean(initialText && initialText.length > 0),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conclusionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!autoFocus) return undefined;
    const id = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(id);
    // Mount-only: each surface mounts a fresh CaptureCore per capture
    // session (CaptureOverlay unmounts it while closed), so seeding +
    // autofocus only need to run once per mount, never on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (conclusionTimeoutRef.current) {
        clearTimeout(conclusionTimeoutRef.current);
      }
    };
  }, []);

  // Track the in-flight parse this instance started and react to its
  // WorkflowContext-reported phase. Never a second poll/fetch of our own —
  // captureParse is the single source of truth already owned by the caller.
  // Only ever watched while `waiting` (set by handleSaveParse right after
  // the submit call), so a stale captureParse phase left over from a prior
  // session elsewhere is never misread as this instance's own.
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    if (!captureParse) return;

    if (captureParse.phase === "parsed") {
      concludeWith("parsed");
    } else if (captureParse.phase === "failed") {
      setPhase({
        kind: "degraded",
        message: captureParse.message,
        canRetryWithMock: captureParse.canRetryWithMock,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureParse, phase]);

  function concludeWith(outcome: CaptureCoreOutcome) {
    const hookLabel = returnHook.trim() || DEFAULT_HOOK_LABEL;
    setPhase({ kind: "conclusion", hookLabel, outcome });
    conclusionTimeoutRef.current = setTimeout(() => {
      finishResolved(outcome);
    }, CONCLUSION_AUTO_DISMISS_MS);
  }

  function finishResolved(outcome: CaptureCoreOutcome) {
    if (conclusionTimeoutRef.current) {
      clearTimeout(conclusionTimeoutRef.current);
      conclusionTimeoutRef.current = null;
    }
    setText("");
    setReturnHook("");
    setPhase({ kind: "idle" });
    onResolved?.(outcome);
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setText(value);
    onDraftChange?.(value);
  }

  const canSubmit = text.trim().length > 0 && !disabledReason;
  const locked = phase.kind !== "idle";

  useEffect(() => {
    onLockChange?.(locked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // If this instance unmounts while locked (its surface was torn down
  // mid-wait, e.g. the route changed), release the caller's lock — chrome
  // that disabled itself in step with us (nav buttons, Close) must never
  // stay stuck disabled after we're gone.
  useEffect(() => {
    return () => {
      onLockChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaveParse() {
    if (!canSubmit || locked || !onSubmitParse) return;
    const trimmed = text.trim();
    const hook = returnHook.trim() || null;
    onSubmitParse(trimmed, hook);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      // Offline: WorkflowContext queues the raw capture and never starts a
      // parse (no captureParse transition to wait on) — the raw save is
      // already durable, so this resolves immediately, synchronously, as
      // FR-027 requires (no spinner for a parse that will never run).
      concludeWith("raw");
      return;
    }
    setPhase({ kind: "waiting" });
  }

  function handleSaveRaw() {
    if (!canSubmit || locked) return;
    const trimmed = text.trim();
    const hook = returnHook.trim() || null;
    onSubmitRaw(trimmed, hook);
    if (mode === "raw-only" || compact) {
      // Focus-preserving path (Execute side-capture): raw save is
      // synchronous and there is nothing to wait on, so resolve immediately
      // with no conclusion takeover — the caller's own chrome (toast) says
      // it was saved.
      finishResolved("raw");
      return;
    }
    concludeWith("raw");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isSubmitCombo =
      event.key === "Enter" &&
      (submitShortcut === "enter"
        ? !event.shiftKey
        : event.metaKey || event.ctrlKey);
    if (isSubmitCombo) {
      event.preventDefault();
      if (phase.kind === "conclusion") {
        finishResolved(phase.outcome);
        return;
      }
      if (mode === "parse") {
        handleSaveParse();
      } else {
        handleSaveRaw();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (phase.kind === "idle") {
        onCancel?.();
      } else if (phase.kind === "conclusion") {
        finishResolved(phase.outcome);
      }
      // Waiting/degraded: swallow — holds the user in context, no early
      // abandon while a parse is in flight (FR-026).
    }
  }

  function handleRetryWithMock() {
    if (phase.kind !== "degraded") return;
    onRetryWithMock?.();
    setPhase({ kind: "waiting" });
  }

  function handleKeepAsRaw() {
    if (phase.kind !== "degraded") return;
    concludeWith("failed-raw");
  }

  const id = testIdPrefix;

  return (
    <div className={cn("grid gap-3", className)} data-testid={`${id}-core`}>
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        readOnly={locked}
        disabled={Boolean(disabledReason)}
        aria-label="Capture thought"
        placeholder={placeholder}
        data-testid={`${id}-textarea`}
        className={textareaClassName}
      />

      {restored ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`${id}-draft-restored`}
        >
          Draft restored
        </p>
      ) : null}

      {showReturnHook ? (
        /* #689 scope add (owner): "Return hook" was jargon nobody could
           explain after using it. Option (a) — self-explanatory in one plain
           phrase where it stands: the label says what it does (the closing
           "back to: <what you type>" line), the placeholder shows an
           example. Same field, same behavior, same testid. */
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          What were you doing? We&apos;ll point you back to it after you save.
          (optional)
          <input
            value={returnHook}
            onChange={(event) => setReturnHook(event.target.value)}
            readOnly={locked}
            placeholder="e.g. writing the report"
            className={cn(
              HIT_TARGET_ROW,
              "rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
            data-testid={`${id}-return-hook`}
          />
        </label>
      ) : null}

      {phase.kind === "waiting" ? (
        <p
          role="status"
          aria-live="polite"
          className="text-xs font-semibold text-muted-foreground"
          data-testid={`${id}-parsing`}
        >
          Parsing capture into drafts…
        </p>
      ) : null}

      {phase.kind === "degraded" ? (
        <div
          role="status"
          aria-live="polite"
          className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-900 dark:text-amber-200"
          data-testid={`${id}-degraded`}
        >
          <p>{phase.message}</p>
          <div className="flex flex-wrap gap-2">
            {phase.canRetryWithMock ? (
              <button
                type="button"
                onClick={handleRetryWithMock}
                className={cn(
                  HIT_TARGET_MIN,
                  "rounded-full bg-primary px-4 text-primary-foreground",
                )}
                data-testid={`${id}-retry-mock`}
              >
                Parse with mock parser
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleKeepAsRaw}
              className={cn(
                HIT_TARGET_MIN,
                "rounded-full border border-input px-4",
              )}
              data-testid={`${id}-keep-raw`}
            >
              Keep as raw
            </button>
          </div>
        </div>
      ) : null}

      {phase.kind === "conclusion" ? (
        <button
          type="button"
          role="status"
          aria-live="polite"
          onClick={() => finishResolved(phase.outcome)}
          className={cn(
            HIT_TARGET_INVISIBLE,
            "justify-self-start text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline",
          )}
          data-testid={`${id}-conclusion`}
        >
          back to: {phase.hookLabel}
        </button>
      ) : null}

      {hint && phase.kind === "idle" ? (
        <p className="text-xs font-semibold text-muted-foreground">{hint}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {mode === "parse" ? (
          <button
            type="button"
            onClick={handleSaveRaw}
            disabled={!canSubmit || locked}
            className={cn(
              HIT_TARGET_INVISIBLE,
              "rounded-full px-4 text-xs font-semibold",
              canSubmit && !locked
                ? "text-muted-foreground hover:text-foreground"
                : "cursor-not-allowed text-muted-foreground/50",
              saveRawButtonClassName,
            )}
            data-testid={`${id}-save-raw`}
          >
            {saveRawLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={mode === "parse" ? handleSaveParse : handleSaveRaw}
          disabled={!canSubmit || locked}
          className={cn(
            "min-h-11 rounded-full px-5 font-bold",
            canSubmit && !locked
              ? "bg-primary text-primary-foreground"
              : "cursor-not-allowed bg-muted text-muted-foreground",
            saveButtonClassName,
          )}
          data-testid={`${id}-save`}
        >
          {locked && phase.kind === "waiting" ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
