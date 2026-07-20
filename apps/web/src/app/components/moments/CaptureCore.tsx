"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { HIT_TARGET_INVISIBLE, HIT_TARGET_ROW } from "./hitTarget";

/**
 * #556 (FR-026 capture containment) — the ONE capture widget shared by all
 * three capture surfaces: the moments-home overlay (CaptureOverlay.tsx wraps
 * this in dialog chrome), the /capture route (CaptureView in
 * LifeOSCockpit.tsx wraps this in page chrome), and the Execute side-capture
 * rail (wraps this with `mode="quick"` compact).
 *
 * #703 (owner-ratified 2026-07-19) — ONE action, "Capture". This component
 * no longer parses anything. It used to own a second save button and the
 * whole parse-wait containment sequence (spinner, degraded banner, mock
 * retry); both save buttons already persisted the identical capture item and
 * the only difference was whether the AI parse ran immediately. That parse
 * now runs on demand from triage instead (`sortCaptureIntoDrafts`), so the
 * wait and its failure states have no trigger left here and are gone. The
 * parse machinery itself is untouched and fully alive — it moved, it was not
 * deleted.
 *
 * Still owns: the raw text + return-hook fields and the closing
 * "back to: <hook>" conclusion. Those are context-restoration elements, not
 * parse-wait elements — FR-026's point is that an interrupting thought
 * shouldn't cost you your place, which is true whether or not an AI runs.
 * Kind chips (Task/Note/Idea) are removed here, not reimplemented: the
 * schema has no field they ever fed, so they were cosmetic from day one
 * (see #556 report).
 *
 * Saving is now synchronous end to end: the capture is staged and persisted
 * with no round-trip to await, so there is no in-flight state to
 * disambiguate and no way for a second capture to collide with a first.
 */

export type CaptureCoreMode = "full" | "quick";

type CorePhase = { kind: "idle" } | { kind: "conclusion"; hookLabel: string };

export interface CaptureCoreProps {
  // "full": the dedicated capture surfaces (overlay, /capture route,
  // onboarding) — shows the return hook and the closing "back to:" line.
  // "quick": the Execute side-capture rail — saves and gets straight out of
  // the way so a focus session is never interrupted by its own capture box.
  mode: CaptureCoreMode;
  compact?: boolean;
  initialText?: string;
  placeholder?: string;
  autoFocus?: boolean;
  showReturnHook?: boolean;
  onDraftChange?(text: string): void;
  // Persists the capture (or queues it offline). Synchronous from this
  // component's point of view — there is nothing to await.
  onSubmit(text: string, returnHook: string | null): void;
  // Fires once the capture is saved and the conclusion (if any) is done —
  // the caller closes/navigates/toasts here, never before.
  onResolved?(): void;
  // Escape/close while idle; also dismisses the conclusion.
  onCancel?(): void;
  // Reports whether a new capture may begin right now — false only while
  // the brief conclusion is on screen. Lets chrome around this core (e.g.
  // CaptureOverlay's Close button) disable itself in step.
  onLockChange?(locked: boolean): void;
  saveLabel?: string;
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
  // large borderless composer) override the default ui/textarea chrome.
  textareaClassName?: string;
  // LifeOSCockpit uses its own `--btn`/`--acc` cockpit theme tokens (scoped
  // under `.lifeos-cockpit[data-theme]`), separate from the shadcn
  // `--primary`/`--muted` tokens this component defaults to — override so
  // the button follows whichever surface's theme it's embedded in.
  saveButtonClassName?: string;
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
  showReturnHook = mode === "full" && !compact,
  onDraftChange,
  onSubmit,
  onResolved,
  onCancel,
  onLockChange,
  // #703: one action, and its label says exactly what happens — the thought
  // is saved, as written, right now. No promise about sorting: that is a
  // separate step the user takes in triage when they choose to.
  saveLabel = "Capture",
  hint,
  disabledReason,
  testIdPrefix = "capture",
  className,
  submitShortcut = "enter",
  textareaClassName,
  saveButtonClassName,
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

  function concludeWith() {
    const hookLabel = returnHook.trim() || DEFAULT_HOOK_LABEL;
    setPhase({ kind: "conclusion", hookLabel });
    conclusionTimeoutRef.current = setTimeout(() => {
      finishResolved();
    }, CONCLUSION_AUTO_DISMISS_MS);
  }

  function finishResolved() {
    if (conclusionTimeoutRef.current) {
      clearTimeout(conclusionTimeoutRef.current);
      conclusionTimeoutRef.current = null;
    }
    setText("");
    setReturnHook("");
    setPhase({ kind: "idle" });
    onResolved?.();
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
  // mid-conclusion, e.g. the route changed), release the caller's lock —
  // chrome that disabled itself in step with us must never stay stuck.
  useEffect(() => {
    return () => {
      onLockChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSave() {
    if (!canSubmit || locked) return;
    const trimmed = text.trim();
    const hook = returnHook.trim() || null;
    onSubmit(trimmed, hook);
    if (mode === "quick" || compact) {
      // Focus-preserving path (Execute side-capture): resolve immediately
      // with no conclusion takeover — the caller's own chrome (toast) says
      // it was saved.
      finishResolved();
      return;
    }
    concludeWith();
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
        finishResolved();
        return;
      }
      handleSave();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (phase.kind === "idle") {
        onCancel?.();
      } else {
        finishResolved();
      }
    }
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
           explain after using it. Self-explanatory in one plain phrase
           where it stands: the label says what it does (the closing
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

      {phase.kind === "conclusion" ? (
        <button
          type="button"
          role="status"
          aria-live="polite"
          onClick={() => finishResolved()}
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
        <button
          type="button"
          onClick={handleSave}
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
          {saveLabel}
        </button>
      </div>
    </div>
  );
}
