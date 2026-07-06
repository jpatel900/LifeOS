"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useReturnFocus } from "./useReturnFocus";
import { useFocusTrap } from "./useFocusTrap";
import { HIT_TARGET_INVISIBLE, HIT_TARGET_MIN } from "./hitTarget";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Quick-capture dialog opened by CaptureAffordance / the "c" shortcut.
 * Renders nothing when closed. Enter (without Shift) saves and clears;
 * Escape closes. Kind chips are single-select, first kind defaults active.
 * Transition duration reads --motion-base via inline style per house rule
 * (no new keyframes added to globals.css in this packet).
 *
 * SP-5: unsaved text must survive an accidental close/reopen within the
 * session. This component stays uncontrolled for `text` (it still owns
 * local useState and still clears it on save, so standalone callers/tests
 * that omit the new props keep working) but accepts an optional
 * `initialText` to seed from on open and an optional `onDraftChange` to
 * report keystrokes upward. TodayMoments owns the sessionStorage
 * read/write; this component never touches storage directly.
 */

export interface CaptureOverlayProps {
  open: boolean;
  kinds: string[];
  onSave(text: string, kind: string, returnHook: string | null): void;
  onClose(): void;
  initialText?: string;
  onDraftChange?(text: string): void;
  // G1 floor follow-up: optional "save raw" action — persist the thought
  // verbatim and skip the AI parse. Omitted => the button is not rendered, so
  // standalone callers keep the parse-only behavior.
  onSaveRaw?(text: string, kind: string, returnHook: string | null): void;
}

export function CaptureOverlay({
  open,
  kinds,
  onSave,
  onClose,
  initialText,
  onDraftChange,
  onSaveRaw,
}: CaptureOverlayProps) {
  const [text, setText] = useState("");
  const [selectedKind, setSelectedKind] = useState(kinds[0] ?? "");
  const [returnHook, setReturnHook] = useState("");
  const [restored, setRestored] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // SP-1: capture the opener before any autofocus effect below moves focus
  // into the dialog, and trap Tab while open. Both hooks must be called
  // above the `if (!open) return null` so they see the same commit `open`
  // flips true on.
  useReturnFocus(open);
  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (open) {
      setSelectedKind(kinds[0] ?? "");
      const seeded = initialText ?? "";
      setText(seeded);
      setReturnHook("");
      setRestored(seeded.length > 0);
      const id = requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
      return () => cancelAnimationFrame(id);
    }
    return undefined;
    // Seeding only happens on the open transition, not on every
    // initialText change, so mid-typing edits never get clobbered by a
    // stale prop from the parent's own state update cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    setText(value);
    onDraftChange?.(value);
  }

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed, selectedKind, returnHook.trim() || null);
    setText("");
    setReturnHook("");
  }

  function handleSaveRaw() {
    if (!onSaveRaw) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSaveRaw(trimmed, selectedKind, returnHook.trim() || null);
    setText("");
    setReturnHook("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSave();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      data-testid="capture-overlay"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
        onClick={onClose}
        data-testid="capture-overlay-scrim"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Capture a thought"
        className="workflow-primary-card relative z-10 m-4 grid w-full max-w-lg gap-3 rounded-xl border border-border bg-card p-5 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
      >
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          data-testid="capture-overlay-textarea"
        />

        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Return hook
          <input
            value={returnHook}
            onChange={(event) => setReturnHook(event.target.value)}
            placeholder="What should you go back to afterward?"
            className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-normal text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            data-testid="capture-overlay-return-hook"
          />
        </label>

        {restored ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="capture-overlay-draft-restored"
          >
            Draft restored
          </p>
        ) : null}

        <div
          className="flex flex-wrap gap-2"
          data-testid="capture-overlay-kinds"
        >
          {kinds.map((kind) => {
            const selected = kind === selectedKind;
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedKind(kind)}
                className={cn(
                  HIT_TARGET_MIN,
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:duration-0",
                  selected
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                data-testid={`capture-overlay-kind-${kind}`}
              >
                {kind}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Enter to save · Shift+Enter for a new line · Esc to close
          </p>
          <div className="flex items-center gap-3">
            {onSaveRaw ? (
              <button
                type="button"
                onClick={handleSaveRaw}
                className={cn(
                  HIT_TARGET_INVISIBLE,
                  "text-xs font-semibold text-muted-foreground hover:text-foreground",
                )}
                title="Save the thought verbatim, without AI parsing (parsed later at triage)"
                data-testid="capture-overlay-save-raw"
              >
                Save raw
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={cn(
                HIT_TARGET_INVISIBLE,
                "text-xs font-semibold text-muted-foreground hover:text-foreground",
              )}
              data-testid="capture-overlay-close"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
