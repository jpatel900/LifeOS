import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * SP-1 packet: focus discipline.
 *
 * Traps Tab/Shift-Tab inside a container's focusable elements while
 * `active`, so keyboard users can't tab out of an open dialog into the page
 * behind it. Hand-rolled (no new dependency) — a well-known ~30-line
 * pattern: on Tab, find the focusable elements inside the container in DOM
 * order, and if focus would move past either end, wrap it to the other end.
 *
 * Only Tab is intercepted. Escape/Enter/Arrow keys and any other key reach
 * whatever handler the dialog already attaches — this hook never calls
 * `preventDefault` for a non-Tab key and never touches `KeyboardEvent`
 * beyond checking `event.key`.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  );
}

export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return undefined;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusable(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;

      // Focus may currently be on something that isn't itself in the
      // focusable list — e.g. the dialog shell's own tabIndex=-1 container,
      // which is what actually holds focus right after autofocus-on-open
      // for MomentSheet. Treat "not one of the tracked focusables" as being
      // at a boundary (same as sitting on `first`/`last`), not as "inside,
      // do nothing" — otherwise native Tab falls through and focus escapes
      // the trap on the very first keypress.
      const isTracked = current !== null && focusable.includes(current);

      if (event.shiftKey) {
        if (!isTracked || current === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (!isTracked || current === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    const container = containerRef.current;
    if (!container) return undefined;

    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [active, containerRef]);
}
