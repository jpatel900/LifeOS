"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReturnFocus } from "./useReturnFocus";
import { useFocusTrap } from "./useFocusTrap";

/**
 * Moments pass P3 — packet: assembled moments (Start/Flow/Close + TodayMoments).
 *
 * Cmd/Ctrl+K command palette, opened via useMomentKeyboard's paletteCombo.
 * Visual idiom mirrors CaptureOverlay (modal over a scrim). Renders nothing
 * when closed. ArrowUp/ArrowDown move the highlighted row (wrapping), Enter
 * runs it, Escape closes — this component owns its own Escape handling
 * (UX-INV-5) since the global keyboard listener is disabled while any
 * overlay is open.
 */

export interface CommandPaletteAction {
  id: string;
  label: string;
  hint?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  actions: CommandPaletteAction[];
  onRun(id: string): void;
  onClose(): void;
}

export function CommandPalette({
  open,
  actions,
  onRun,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // SP-1: capture the opener before the autofocus effect below moves focus
  // into the input, and trap Tab while open.
  useReturnFocus(open);
  useFocusTrap(open, dialogRef);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((action) => action.label.toLowerCase().includes(q));
  }, [actions, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  if (!open) return null;

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) =>
        filtered.length === 0 ? 0 : (current + 1) % filtered.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) =>
        filtered.length === 0
          ? 0
          : (current - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const action = filtered[highlighted];
      if (action) {
        onRun(action.id);
        onClose();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 sm:pt-32"
      data-testid="command-palette"
    >
      <div
        className="absolute inset-0 bg-black/40 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
        onClick={onClose}
        data-testid="command-palette-scrim"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="workflow-primary-card relative z-10 m-4 grid w-full max-w-lg gap-2 rounded-xl border border-border bg-card p-4 motion-reduce:transition-none motion-reduce:duration-0"
        style={{
          transitionDuration: "var(--motion-base)",
          transitionTimingFunction: "var(--motion-ease)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command…"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="command-palette-input"
        />

        <ul
          role="listbox"
          aria-label="Commands"
          className="grid max-h-72 gap-0.5 overflow-y-auto"
          data-testid="command-palette-list"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-3 text-sm text-muted-foreground">
              No matching commands.
            </li>
          ) : (
            filtered.map((action, index) => {
              const active = index === highlighted;
              return (
                <li
                  key={action.id}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => {
                    onRun(action.id);
                    onClose();
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted/60",
                  )}
                  data-testid={`command-palette-option-${action.id}`}
                >
                  <span>{action.label}</span>
                  {action.hint ? (
                    <span
                      className={cn(
                        "text-xs",
                        active
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {action.hint}
                    </span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
