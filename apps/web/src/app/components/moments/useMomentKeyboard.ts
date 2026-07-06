import { useEffect } from "react";
import {
  matchesMomentKeyBinding,
  momentKeyBindingById,
} from "@/lib/keys/keymap";

/**
 * Moments pass P1 — packet: structural moments (Start/Flow/Close cockpit).
 *
 * Encodes the ratified keyboard system (UX-INV-1 global moment-switching,
 * UX-INV-2 single-key capture/primary actions, UX-INV-5 escape-always-works)
 * and ADR D2 (typing fields win: any focused text input suppresses every
 * shortcut except Escape/Enter, and the Cmd/Ctrl+K palette combo is
 * disabled while typing so it never fights normal text entry).
 */

export interface MomentKeyboardHandlers {
  onSwitchMoment(moment: "start" | "flow" | "close"): void;
  onCapture(): void;
  onPalette(): void;
  onPrimary(): void;
  onEscape(): void;
  /** When false, the listener is inert (still attached/detached, no-op). */
  enabled?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Attaches a single global keydown listener on window for the duration of
 * the mount. Constraint: exactly one listener per mounted instance, removed
 * on unmount — callers must not rely on ordering across multiple instances.
 */
export function useMomentKeyboard(handlers: MomentKeyboardHandlers): void {
  const {
    onSwitchMoment,
    onCapture,
    onPalette,
    onPrimary,
    onEscape,
    enabled = true,
  } = handlers;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent): void {
      const typing = isTypingTarget(event.target);
      const paletteCombo = matchesMomentKeyBinding(
        event,
        momentKeyBindingById("open-command-palette"),
      );

      if (typing) {
        // Typing fields win: only Escape/Enter pass through; the palette
        // combo is ignored too (ADR D2), every other mapping is inert.
        if (matchesMomentKeyBinding(event, momentKeyBindingById("escape"))) {
          onEscape();
        } else if (
          matchesMomentKeyBinding(event, momentKeyBindingById("primary-action"))
        ) {
          onPrimary();
        }
        return;
      }

      if (paletteCombo) {
        event.preventDefault();
        onPalette();
        return;
      }

      // Any other held modifier is a pass-through combo we don't own.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const momentBinding = [
        momentKeyBindingById("switch-start"),
        momentKeyBindingById("switch-flow"),
        momentKeyBindingById("switch-close"),
      ].find((binding) => matchesMomentKeyBinding(event, binding));
      if (momentBinding?.moment) {
        onSwitchMoment(momentBinding.moment);
        return;
      }

      if (
        matchesMomentKeyBinding(event, momentKeyBindingById("open-capture"))
      ) {
        onCapture();
        return;
      }

      if (
        matchesMomentKeyBinding(event, momentKeyBindingById("primary-action"))
      ) {
        onPrimary();
        return;
      }

      if (matchesMomentKeyBinding(event, momentKeyBindingById("escape"))) {
        onEscape();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSwitchMoment, onCapture, onPalette, onPrimary, onEscape, enabled]);
}
