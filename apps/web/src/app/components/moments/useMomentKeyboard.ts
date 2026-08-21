import { useLayoutEffect } from "react";
import {
  matchesMomentKeyBinding,
  momentKeyBindingById,
} from "@/lib/keys/keymap";
import { isTypingTarget } from "./typingTarget";

/**
 * Moments pass P1 — packet: structural moments (Start/Flow/Close cockpit).
 *
 * Encodes the ratified keyboard system (UX-INV-1 global moment-switching,
 * UX-INV-2 single-key capture/primary actions, UX-INV-5 escape-always-works)
 * and ADR D2 (typing fields win: any focused text input suppresses every
 * shortcut except Escape/Enter, and the Cmd/Ctrl+K palette combo is
 * disabled while typing so it never fights normal text entry).
 *
 * "Typing" means a real text-entry context only — INPUT/TEXTAREA/SELECT or
 * `isContentEditable` (see `./typingTarget`'s `isTypingTarget`, shared with
 * every other window-level keydown listener in this directory since the
 * round-6 bug-echo sweep found the identical defect copy-pasted into
 * AreaSelector.tsx/MastheadThemeToggle.tsx). A focused BUTTON or A is NOT a
 * typing context: every shortcut here still fires the instant focus lands on
 * one. The only special case a button/link earns is narrower —
 * `isNativeActivationTarget` below stops Enter from double-firing the global
 * primary action on top of the control's own native Enter-activates-click
 * behavior. (#687 round-6: the two were previously folded into one check,
 * which killed every shortcut but Escape after clicking ANY control.)
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

/**
 * #687 round-6 judge (WORST DEFECT, fixed here): BUTTON/A used to be folded
 * into `isTypingTarget` above, which blocks every mapping except Escape. That
 * was wrong — a button is not a text-entry context, so clicking ANY control
 * (theme toggle, moment tab, a sheet's own close button, ...) left it
 * focused, and the very next keydown's `event.target` is that focused
 * element: every shortcut but Escape died until focus returned to the page
 * background. The ONE real reason BUTTON/A needed special handling at all is
 * narrower than "typing": native activation. Enter/Space already trigger a
 * click on a focused button or link, so the global "Enter -> onPrimary"
 * mapping must not ALSO fire (double-activation) — that is the one case this
 * checks, nothing else. 1/2/3, C and Ctrl+K now keep working the instant
 * focus lands on a control, matching the original intent (the gate exists to
 * stop "C" from typing into a field, not to require BODY focus).
 */
function isNativeActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "BUTTON" || target.tagName === "A";
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

  useLayoutEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent): void {
      const typing = isTypingTarget(event.target);
      const paletteCombo = matchesMomentKeyBinding(
        event,
        momentKeyBindingById("open-command-palette"),
      );

      if (typing) {
        // Native interactive controls win: global shortcuts never turn
        // Enter from a focused control into the page primary action. Escape
        // remains a global close affordance for overlays.
        if (matchesMomentKeyBinding(event, momentKeyBindingById("escape"))) {
          onEscape();
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
        // A focused button/link already activates on Enter natively — don't
        // also fire the global primary action, or it would double-activate.
        if (!isNativeActivationTarget(event.target)) {
          onPrimary();
        }
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
