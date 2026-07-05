"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Quick-capture dialog opened by CaptureAffordance / the "c" shortcut.
 * Renders nothing when closed. Enter (without Shift) saves and clears;
 * Escape closes. Kind chips are single-select, first kind defaults active.
 * Transition duration reads --motion-base via inline style per house rule
 * (no new keyframes added to globals.css in this packet).
 */

export interface CaptureOverlayProps {
  open: boolean;
  kinds: string[];
  onSave(text: string, kind: string): void;
  onClose(): void;
}

export function CaptureOverlay({
  open,
  kinds,
  onSave,
  onClose,
}: CaptureOverlayProps) {
  const [text, setText] = useState("");
  const [selectedKind, setSelectedKind] = useState(kinds[0] ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setSelectedKind(kinds[0] ?? "");
      const id = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed, selectedKind);
    setText("");
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
        className="absolute inset-0 bg-black/40"
        style={{ transitionDuration: "var(--motion-base)" }}
        onClick={onClose}
        data-testid="capture-overlay-scrim"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Capture a thought"
        className="workflow-primary-card relative z-10 m-4 grid w-full max-w-lg gap-3 rounded-xl border border-border bg-card p-5"
        style={{ transitionDuration: "var(--motion-base)" }}
      >
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What's on your mind?"
          data-testid="capture-overlay-textarea"
        />

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
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
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

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Enter to save · Shift+Enter for a new line · Esc to close
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            data-testid="capture-overlay-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
