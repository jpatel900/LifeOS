# Phase 9A Hardening + Usability Audit

Date: 2026-05-14  
Scope: Audit only (no capability expansion).  
Surfaces reviewed: AppShell, Capture, Triage, Calendar/Planning, Google Calendar approval flow, Execute, Review, Health, Settings, observability status, mock/local mode, empty/failure states.

## Top usability blockers

1. Source-of-truth messaging was mixed across Capture, Triage, and Settings (local session vs persisted rows).
2. Area-selection behavior was not explained consistently between shell header picker and page-level persisted area selectors.
3. Triage/Settings helper text referenced phase-internal implementation details instead of current user-facing behavior.

## Top reliability risks

1. Users could accept/reject drafts while assuming those drafts were already persisted.
2. Session reset language was ambiguous enough to imply potential persisted data loss.
3. Hidden state coupling between shell-selected mock area and persisted area slug mapping could be misread as deterministic bidirectional sync.

## Missing smoke/regression coverage

1. No explicit guard that shell/capture/triage/settings copy continues to distinguish local session state from persisted provider state.
2. Route smoke assertions covered provider wiring but did not assert clarified area-context language.
3. Capture tests did not assert copy that distinguishes persisted actions from local session actions.

## Weak failure/empty states

1. Triage empty-state copy referenced future parsing behavior rather than current capture inputs.
2. Some helper text implied hidden or future functionality for area reassignment.
3. Settings reset section used phase labels that obscured actual data boundaries.

## Copy/hidden-state confusion

1. "mock" and "persisted" terms were both present but not normalized.
2. "Area" labels did not always indicate whether they represented local session workflow context or persisted row scope.
3. Phase-number copy leaked into runtime UI where behavioral labels were needed.

## Phase 7/8 privacy-security concerns

1. No new direct token/secrets leak found in the reviewed Phase 7/8 workflow surfaces.
2. Main concern remained user misunderstanding of where data is stored, not a new technical exfiltration path.

## Recommended PR sequence

1. Phase 9B: Source-of-truth clarity and settings/admin copy cleanup (no behavior changes).
2. Phase 9C: Failure/empty-state hardening for Capture/Triage/Planning/Execute/Review/Health.
3. Phase 9D: Focused smoke/regression additions for critical V1 workflow invariants and failure paths.
4. Phase 9E: Final hardening sweep + release-readiness proof (no new features).

## Likely touched files for 9B

- `apps/web/src/app/components/AppShell.tsx`
- `apps/web/src/app/capture/page.tsx`
- `apps/web/src/app/triage/page.tsx`
- `apps/web/src/app/settings/areas/page.tsx`
- `apps/web/src/__tests__/routeSmoke.test.tsx`
- `apps/web/src/__tests__/capture.test.tsx`
- `apps/web/src/__tests__/sourceOfTruth.test.ts`

## 9B acceptance criteria

1. AppShell, Capture, Triage, and Settings must not imply contradictory sources of truth.
2. Users must be able to tell local session data from persisted provider-backed rows.
3. Area-selection language must be consistent across touched surfaces.
4. Behavior must remain unchanged except for clarity/helper copy.
5. Focused regression coverage must lock the clarified source-of-truth messaging.
