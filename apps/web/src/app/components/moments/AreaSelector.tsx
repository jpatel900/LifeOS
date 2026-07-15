"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  matchesMomentKeyBinding,
  momentKeyBindingById,
  momentKeyLabel,
} from "@/lib/keys/keymap";
import { HIT_TARGET_MIN, HIT_TARGET_ROW } from "./hitTarget";
import { kbdHintClass } from "./kbdChip";

/**
 * D-10 (#483, masthead audit finding #1 — "the single most off-language
 * element on the page"): replaces the topbar's native `<select>` area
 * picker with a custom pill trigger + listbox popup in the app's own
 * visual language (swatch + label + kbd hint, matching MomentSwitcher /
 * CountdownClockToggle's pill idiom), while staying fully keyboard
 * accessible and screen-reader labelled.
 *
 * ARIA shape: a "select-only combobox" (WAI-ARIA APG) — the trigger button
 * carries `role="combobox"` + `aria-expanded` + `aria-controls` +
 * `aria-activedescendant`; focus never leaves the trigger (mirrors
 * CommandPalette.tsx's already-reviewed combobox/listbox wiring, just with
 * a button in place of a text input). Escape closes without changing the
 * selection; outside-click/blur close too. No focus trap needed — this
 * pattern never moves focus into the popup.
 *
 * Swatch truthfulness: each area's dot uses `area.color`, which is real
 * per-area data (`Phase2MockArea.color: string`, always populated —
 * WorkflowContext's `applyPersistedAreas` normalizes a null DB color to
 * "#64748b" before it ever reaches this component). "All areas" has no
 * color of its own, so its dot is a neutral outline, never a fabricated
 * hue.
 *
 * The "A" kbd hint is real, not decorative: pressing it (when
 * `shortcutEnabled`) cycles the selection through All areas -> each area
 * -> back to All areas, mirroring the design prototype's `cycleArea()`.
 * Implemented as this component's own guarded window listener (not routed
 * through `useMomentKeyboard`, which this packet doesn't own) — see
 * keymap.ts's "cycle-area" binding for the collision-checked definition.
 *
 * D-10 R2 (#483 round 2): the trigger now carries a real focus-visible ring
 * (the app's own `--ring` token, applied everywhere else in the masthead —
 * a DOM scan of the Start page found this control, like its siblings,
 * falling through to the bare browser default outline on Tab) and switched
 * from HIT_TARGET_ROW to HIT_TARGET_MIN so a very short area name can never
 * shrink the trigger under the 44px hit-target floor once the kbd hint's
 * width drops out of the mobile layout (kbdChip.ts's HINT_REVEAL — hidden
 * below `sm`, hover/focus-revealed above it).
 */

export interface AreaSelectorOption {
  id: string;
  name: string;
  color: string;
}

export interface AreaSelectorProps {
  areas: AreaSelectorOption[];
  value: string | null;
  onChange(areaId: string | null): void;
  /**
   * When false, the "A" cycle shortcut is inert (still attached/detached,
   * no-op) — pass the same expression TodayMoments already computes for
   * `useMomentKeyboard`'s `enabled` (no overlay/ritual/onboarding active),
   * so the widget never fires a shortcut behind a modal.
   */
  shortcutEnabled?: boolean;
}

interface Option {
  id: string | null;
  name: string;
  color: string | null;
}

const ALL_AREAS_OPTION: Option = { id: null, name: "All areas", color: null };

// Inline (not a Tailwind `border-current`/`border-border` class) is
// deliberate: globals.css's `* { @apply border-border; }` reset is an
// *unlayered* rule, which CSS Cascade Layers always ranks above anything
// inside Tailwind's `@layer utilities` — so any `border-*` color utility on
// any element in this app is silently overridden back to `var(--border)`
// regardless of class order. An inline `style` wins over any stylesheet
// rule (layered or not), which is the only reliable way to paint this
// swatch a different, more visible neutral tone than the app's hairline
// border color. `--muted-foreground` is an existing token (no new value
// added to globals.css).
const NEUTRAL_SWATCH_STYLE = { borderColor: "var(--muted-foreground)" };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    tag === "A"
  ) {
    return true;
  }
  return target.isContentEditable;
}

function optionKey(option: Option): string {
  return option.id ?? "all";
}

export function AreaSelector({
  areas,
  value,
  onChange,
  shortcutEnabled = true,
}: AreaSelectorProps) {
  const options = useMemo<Option[]>(
    () => [ALL_AREAS_OPTION, ...areas],
    [areas],
  );
  const selectedIndex = useMemo(() => {
    const index = options.findIndex((option) => option.id === value);
    return index === -1 ? 0 : index;
  }, [options, value]);
  const selected = options[selectedIndex] ?? ALL_AREAS_OPTION;

  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(selectedIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = "area-selector-listbox";

  useEffect(() => {
    if (open) setHighlighted(selectedIndex);
  }, [open, selectedIndex]);

  // Outside click closes without changing the selection.
  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // D-10: real "A" shortcut — cycles the selection. Guarded exactly like
  // useMomentKeyboard's global listener (typing targets + held modifiers
  // pass through untouched) so it never fights a focused control elsewhere
  // on the page.
  useEffect(() => {
    if (!shortcutEnabled) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!matchesMomentKeyBinding(event, momentKeyBindingById("cycle-area"))) {
        return;
      }
      event.preventDefault();
      const next = options[(selectedIndex + 1) % options.length];
      if (next) onChange(next.id);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutEnabled, options, selectedIndex, onChange]);

  function selectOption(option: Option) {
    onChange(option.id);
    setOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(selectedIndex);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted(
        (current) => (current + delta + options.length) % options.length,
      );
      return;
    }
    if (event.key === "Home") {
      if (!open) return;
      event.preventDefault();
      setHighlighted(0);
      return;
    }
    if (event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setHighlighted(options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) {
        const option = options[highlighted];
        if (option) selectOption(option);
      } else {
        setOpen(true);
        setHighlighted(selectedIndex);
      }
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
    }
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!containerRef.current) return;
    const next = event.relatedTarget as Node | null;
    if (!next || !containerRef.current.contains(next)) {
      setOpen(false);
    }
  }

  const activeOptionId = open
    ? `${listboxId}-option-${optionKey(options[highlighted] ?? selected)}`
    : undefined;

  return (
    <div className="relative" ref={containerRef} onBlur={handleBlur}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-label="Area"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          HIT_TARGET_MIN,
          "group gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm font-semibold text-foreground outline-none transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:duration-0",
        )}
        data-testid="today-moments-area-switcher"
      >
        {selected.color ? (
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{
              background: selected.color,
              boxShadow: `0 0 0 3px color-mix(in oklch, ${selected.color} 18%, transparent)`,
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full border-[1.5px] opacity-70"
            style={NEUTRAL_SWATCH_STYLE}
          />
        )}
        <span className="max-w-[9rem] truncate">{selected.name}</span>
        <kbd className={kbdHintClass()}>{momentKeyLabel("cycle-area")}</kbd>
      </button>

      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Area"
          // Mousedown on a non-focusable option would otherwise shift focus
          // to <body>, firing `handleBlur` on the trigger *before* the
          // click event ever reaches the option — closing (unmounting) the
          // listbox mid-click so the click lands on nothing and the
          // selection silently never happens. preventDefault here keeps
          // focus on the trigger through the whole click, the standard fix
          // for this exact combobox/listbox race.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-30 min-w-[12rem] max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg"
          data-testid="area-selector-listbox"
        >
          {options.map((option, index) => {
            const active = index === highlighted;
            const isSelected = option.id === value;
            return (
              <li
                key={optionKey(option)}
                id={`${listboxId}-option-${optionKey(option)}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => selectOption(option)}
                className={cn(
                  HIT_TARGET_ROW,
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                  active
                    ? "bg-primary text-primary-foreground"
                    : isSelected
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-muted/60",
                )}
                data-testid={`area-selector-option-${optionKey(option)}`}
              >
                {option.color ? (
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: option.color }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full border-[1.5px] opacity-70"
                    style={NEUTRAL_SWATCH_STYLE}
                  />
                )}
                <span className="flex-1 truncate">{option.name}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
