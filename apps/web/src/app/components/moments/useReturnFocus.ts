import { useEffect } from "react";

/**
 * SP-1 packet: focus discipline.
 *
 * Every moments overlay swallows focus on open and, without this hook, drops
 * it back on `<body>` on close — forcing a "where am I" reorientation for
 * keyboard users. This hook captures whatever element owned focus at the
 * instant it becomes `active` and restores focus there once it goes
 * inactive (or the component unmounts), so the user's place in the page is
 * preserved across an overlay's full open/close cycle.
 *
 * Timing: the capture must happen in a synchronous effect (not
 * requestAnimationFrame) so it runs on the same commit `active` flips true —
 * before any autofocus-on-open effect in the overlay itself has a chance to
 * move focus into the dialog. Callers must invoke this hook (and read
 * `active` from the same `open` prop that drives conditional rendering)
 * above any early `if (!open) return null`, so the effect fires on the
 * commit where `open` becomes true.
 */
export function useReturnFocus(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;

    const saved = document.activeElement as HTMLElement | null;

    return () => {
      if (
        saved &&
        document.contains(saved) &&
        typeof saved.focus === "function"
      ) {
        saved.focus();
      }
    };
  }, [active]);
}
