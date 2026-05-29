# Navigation label decision for issue #115

## Decision

Defer broader navigation-label changes for now.

## Why

- `docs/UX_FLOWS.md` is still the authority document for workflow-screen naming and explicitly defines the six primary screens as `Capture`, `Triage`, `Calendar / Planning`, `Execute`, `Review`, and `Health`.
- `docs/ux/LIFEOS_V1_UX_UPGRADE_PLAN.md` suggests a lighter future direction (`Today`, `Focus`, possible later review of `Triage`) but does not override `docs/UX_FLOWS.md`.
- The current runtime already uses a mixed state (`Planning` in nav, `Execute` in nav, `Today` on `/`), which is tolerable for V1 but not a clean enough authority basis for another rename pass.
- Changing labels now would require authority-doc reconciliation first or it would create a docs/runtime mismatch.

## Result

- No route changes.
- No nav label changes in this batch.
- Keep current runtime labels stable until a reviewed doc update explicitly authorizes a label map.

## Recommended next step if this is reopened

Update `docs/UX_FLOWS.md` first with the approved canonical user-facing labels, then make the smallest consistent runtime pass across AppShell, route headings, copy references, and smoke tests.
