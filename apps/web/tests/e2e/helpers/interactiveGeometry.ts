import type { Page } from "@playwright/test";

/**
 * Final UX Loop C5 — geometric proof behind the hit-target pin
 * (hit-target-overlap-pin.spec.ts), reusable from any test file.
 *
 * Mirrors docs/design/ux-audit-2026-07-26-fable.md's own method exactly
 * ("Target sizes and overlaps were measured with `getBoundingClientRect`
 * filtered by `elementFromPoint` hit-testing, so collapsed disclosures and
 * elements behind a modal do not produce false overlaps"):
 *
 *  1. Collect every element that is interactive by tag, role, or tabindex.
 *  2. Drop anything with zero on-screen area (closed <details>, display:none,
 *     the inert half of a two-state toggle) — layout alone already zeroes
 *     these out, no extra bookkeeping needed.
 *  3. Keep only elements that are actually hit-testable at their own visual
 *     center: `document.elementFromPoint(cx, cy)` must resolve to the
 *     element itself or one of its descendants/ancestors. An element sitting
 *     under a modal scrim, or a background element a dialog is currently
 *     covering, fails this check and is excluded — exactly the "elements
 *     behind a modal" case the audit named.
 *  4. Run the two assertions ONLY over that filtered, genuinely-reachable
 *     set: a >=44x44 CSS px floor per element, and a pairwise
 *     bounding-box-intersection check for overlaps between any two distinct
 *     elements.
 *
 * Runs entirely inside the page (page.evaluate) so it sees real computed
 * layout, not a jsdom approximation.
 */

export interface GeometryElement {
  /** Best-effort human-readable identity for a failing assertion message. */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryScanResult {
  /** Every interactive element that passed the hit-testability filter. */
  reachableCount: number;
  /** Elements narrower or shorter than the 44px floor. */
  subMinTargets: GeometryElement[];
  /** Distinct pairs of reachable elements whose boxes intersect. */
  overlappingPairs: Array<[GeometryElement, GeometryElement]>;
}

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='combobox']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/**
 * The function body actually executed inside the page. Exported separately
 * (rather than only via `scanInteractiveGeometry`) so a test can also run it
 * directly through `page.evaluate` if it needs the raw result inline.
 */
export function collectInteractiveGeometryInPage(
  selector: string,
): GeometryScanResult {
  function labelFor(el: Element): string {
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid="${testId}"]`;
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel)
      return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
    const text = (el.textContent ?? "").trim().slice(0, 40);
    return `${el.tagName.toLowerCase()}${text ? ` "${text}"` : ""}`;
  }

  function isHitTestable(el: Element, rect: DOMRect): boolean {
    const cx = Math.min(
      Math.max(rect.left + rect.width / 2, 0),
      innerWidth - 1,
    );
    const cy = Math.min(
      Math.max(rect.top + rect.height / 2, 0),
      innerHeight - 1,
    );
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return false;
    return hit === el || el.contains(hit) || hit.contains(el);
  }

  const candidates = Array.from(document.querySelectorAll(selector));
  const reachable: Array<{ el: Element; rect: DOMRect }> = [];

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue; // closed disclosures, display:none
    if (el.closest("[aria-hidden='true']")) continue;
    if (!isHitTestable(el, rect)) continue; // covered by a modal/scrim/other layer
    reachable.push({ el, rect });
  }

  const subMinTargets: GeometryElement[] = [];
  for (const { el, rect } of reachable) {
    if (rect.width < 44 || rect.height < 44) {
      subMinTargets.push({
        label: labelFor(el),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
  }

  const overlappingPairs: Array<[GeometryElement, GeometryElement]> = [];
  for (let i = 0; i < reachable.length; i += 1) {
    for (let j = i + 1; j < reachable.length; j += 1) {
      const a = reachable[i];
      const b = reachable[j];
      // Ancestor/descendant pairs (e.g. a badge <span> inside its own
      // <button>) are not a real "two controls fighting for one tap" case.
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;

      const intersects =
        a.rect.left < b.rect.right &&
        a.rect.right > b.rect.left &&
        a.rect.top < b.rect.bottom &&
        a.rect.bottom > b.rect.top;
      if (!intersects) continue;

      overlappingPairs.push([
        {
          label: labelFor(a.el),
          x: a.rect.x,
          y: a.rect.y,
          width: a.rect.width,
          height: a.rect.height,
        },
        {
          label: labelFor(b.el),
          x: b.rect.x,
          y: b.rect.y,
          width: b.rect.width,
          height: b.rect.height,
        },
      ]);
    }
  }

  return { reachableCount: reachable.length, subMinTargets, overlappingPairs };
}

export async function scanInteractiveGeometry(
  page: Page,
): Promise<GeometryScanResult> {
  return page.evaluate(collectInteractiveGeometryInPage, INTERACTIVE_SELECTOR);
}
