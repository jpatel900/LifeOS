/**
 * #687 round-6 bug-echo (PR #906 fixed the first instance in
 * useMomentKeyboard.ts; this sweep found the same defect copy-pasted into
 * AreaSelector.tsx and MastheadThemeToggle.tsx and extracted the one correct
 * definition here instead of re-copying it a third and fourth time).
 *
 * "Typing" means a real text-entry context only — INPUT/TEXTAREA/SELECT or
 * `isContentEditable`. A focused BUTTON or A is NOT a typing context: every
 * window-level keydown listener in components/moments/** (the global moment
 * shortcuts, AreaSelector's "A" cycle, MastheadThemeToggle's "D" toggle)
 * must keep firing the instant focus lands on a control. Folding BUTTON/A
 * into this check (the original defect) makes `event.target` — the
 * currently-focused element — look like a typing context after literally
 * any click anywhere on the page, silently killing every shortcut but
 * Escape until focus returns to the page background. See
 * useMomentKeyboard.ts's header comment for the full incident history.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  // `=== true`, not a bare return: real browsers always resolve
  // `isContentEditable` to a boolean, but jsdom (the test environment)
  // resolves it to `undefined` for a plain element with no `contenteditable`
  // attribute — this keeps the function honoring its declared `boolean`
  // return type in both.
  return target.isContentEditable === true;
}
