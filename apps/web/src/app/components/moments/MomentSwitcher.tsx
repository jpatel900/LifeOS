"use client";

import { momentKeyLabel } from "@/lib/keys/keymap";
import { cn } from "@/lib/utils";
import { HIT_TARGET_ROW } from "./hitTarget";

/**
 * Moments pass P2 — packet: presentation primitives (dev-preview only).
 *
 * Three-tab pill switching between the Start/Flow/Close moments. Mirrors
 * useMomentKeyboard's 1/2/3 mapping (UX-INV-1) with matching kbd chips.
 */

export type MomentValue = "start" | "flow" | "close";

export interface MomentSwitcherProps {
  value: MomentValue;
  onChange(value: MomentValue): void;
}

const TABS: { value: MomentValue; label: string; keyHint: string }[] = [
  { value: "start", label: "Start", keyHint: momentKeyLabel("switch-start") },
  { value: "flow", label: "Flow", keyHint: momentKeyLabel("switch-flow") },
  { value: "close", label: "Close", keyHint: momentKeyLabel("switch-close") },
];

export function MomentSwitcher({ value, onChange }: MomentSwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Moment"
      className="workflow-shell__nav inline-flex items-center gap-1 border border-border bg-muted/40 p-1"
      data-testid="moment-switcher"
    >
      {TABS.map((tab) => {
        const selected = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.value)}
            className={cn(
              HIT_TARGET_ROW,
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:duration-0",
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`moment-switcher-${tab.value}`}
          >
            {tab.label}
            <kbd
              className={cn(
                "rounded border px-1 text-[0.65rem] font-semibold",
                selected
                  ? "border-primary-foreground/40 bg-black/10"
                  : "border-border/60 bg-black/5",
              )}
            >
              {tab.keyHint}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
