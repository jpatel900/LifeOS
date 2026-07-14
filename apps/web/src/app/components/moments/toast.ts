/**
 * #590 slice 3: the moments-home toast slot's shared types, split out of
 * `TodayMoments.tsx` so the per-moment controller hooks (`useFlowFocusSession`,
 * `useCloseMomentRollups`) can reference `ToastAction` without importing from
 * the composition root itself. `TodayMoments.tsx` re-exports `ToastAction` to
 * keep its existing export surface unchanged.
 *
 * SP-6: undo over confirm — see `TodayMoments.tsx`'s `showToast` doc comment
 * for the full duration/behavior contract this type slots into.
 */

/** SP-6: the toast slot's action — a real, focusable (never auto-focused) Undo button. */
export interface ToastAction {
  label: string;
  run(): void;
}

export interface ToastState {
  message: string;
  action?: ToastAction;
}
