# 2026-06-24 UI/UX Check

Status: Dated re-audit proof — re-applies the Pass 7 rubric to confirm it still holds
Purpose: Record a fresh empirical UI/UX evaluation of all nine audited surfaces against `docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`, with refreshed evidence, a re-scored worksheet, and a drift check against the latest docs
Read when: Verifying whether the shipped UI still clears the Pass 7 thresholds as of 2026-06-24, or before opening any new UI/UX pass
Do not use for: Opening a new active roadmap pass, or claiming the 2026-06-11 closeout was reopened
Superseded by: n/a

## Why this check ran

The request was to "do the UI/UX check according to the plans and the latest changes in the documentation," using the repo's own evaluation method. The authoritative method is the Pass 7 Final Audit Rubric (`docs/agent/UI_PASS_7_FINAL_AUDIT_RUBRIC.md`): nine surfaces scored on ten dimensions (0–3), with hard thresholds. Pass 7 closed on 2026-06-11 and the roadmap is in maintenance posture, so this is a **regression / drift confirmation that re-applies the rubric with fresh evidence**, not a new pass. The rubric header notes it becomes "historical audit proof" after closeout; this note re-uses it deliberately as the check standard the request asked for.

## Result

Re-audit passed on 2026-06-24.

Threshold check (all true):

- no dimension scored `0`
- every audited route average is at least `2.4`
- `Home` average is at least `2.7` (3.0)
- `Capture` average is at least `2.7` (2.9)

This is an empirical re-verification, not a carry-forward on faith. Every score below was re-checked against a freshly generated 2026-06-24 screenshot packet, fresh browser regression runs, and the full default validation gate. The scores match the 2026-06-11 audit because the rendered UI is materially unchanged since closeout (see "Change surface since closeout"); the two maintenance commits that touched route files did not regress any route contract.

## Method and evidence

### Default validation gate — all green (2026-06-24)

- `pnpm --filter @lifeos/web lint` — no ESLint warnings or errors
- `pnpm --filter @lifeos/web type-check` — `next typegen` + `tsc --noEmit` clean
- `pnpm --filter @lifeos/web test` — 324 passed, 17 skipped (the skipped are the opt-in `RUN_SUPABASE_RLS_TESTS` suite); 50 test files passed, 1 skipped
- `pnpm --filter @lifeos/web build` — production build succeeded, 21 routes generated

Lint and type-check were re-run **after** adding the dated screenshot spec, so those clean results cover the new file (the `tsconfig.json` include is `**/*.ts`, which type-checks `tests/e2e/`).

### Browser regression + rendered-behavior proof — 58 passed (2026-06-24)

One run via `pnpm --filter @lifeos/web test:e2e` (Edge / `msedge` channel, dev server on an isolated port), covering:

- `tests/e2e/p0-ux-regression.spec.ts`
- `tests/e2e/workflow-hierarchy.spec.ts`
- `tests/e2e/interaction-feedback.spec.ts`
- `tests/e2e/workflow-card-accent.spec.ts`
- `tests/e2e/shell-clutter.spec.ts`
- `tests/e2e/app-shell-accent.spec.ts`
- `tests/e2e/execute-focus-flagship.spec.ts`
- `tests/e2e/accessibility-baseline.spec.ts`
- `tests/e2e/motion-performance.spec.ts`
- `tests/e2e/areas-color-edit.spec.ts`
- `tests/e2e/ui-ux-check-2026-06-24.spec.ts` (new dated screenshot packet, below)

Result: **58 passed (6.9m)**, exit code 0.

### Fresh dated screenshot packet

A new spec, `apps/web/tests/e2e/ui-ux-check-2026-06-24.spec.ts`, was added (modeled on `final-audit-packet.spec.ts`) so it writes to its **own dated directory** and never overwrites the historical Pass 7 (2026-06-11) packet. It captures the resting first viewport for all nine surfaces at mobile `390px` and desktop `1440px`.

Output (18 images, gitignored under `test-results/`):

- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-app-shell-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-home-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-capture-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-triage-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-planning-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-execute-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-review-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-health-{mobile,desktop}-rest.png`
- `apps/web/test-results/2026-06-24-ui-ux-check/2026-06-24-areas-{mobile,desktop}-rest.png`

Each image was visually examined as part of scoring.

## Scope and limitations of this evidence

The "pass" is bounded by what the evidence actually exercises. This matches the Pass 7 method (`next dev`, local/mock mode, seeded `sessionStorage`, captured at rest), so it is comparable to the 2026-06-11 baseline — but it does not exercise everything:

- The screenshots render in **local/mock mode** (no Supabase/OpenAI/Google env), so "safety truthfulness" for Planning's real **approval-gated Google write path** is not exercised by the packet; it is covered instead by the unchanged server-only write boundary, the guard tests, and the unchanged code path. The packet shows the degraded-but-honest configuration (e.g. Capture's "AI sorting unavailable"), which is itself a legitimate state to audit.
- Density and copy under **configured/authenticated data** (real queues, real parse output, real calendar conflicts) are not shown; Triage/Execute use seeded fixtures and the others render their empty/at-rest states. Interaction states are partially exercised by `interaction-feedback.spec.ts`, `workflow-card-accent.spec.ts`, and `execute-focus-flagship.spec.ts`, which mitigates the at-rest-only nature of the stills.
- The "N" mark in the bottom-left/right corner of every screenshot is the **Next.js dev-tools indicator**, present only under `next dev` (no `devIndicators` override in `next.config.ts`). It is not shipped UI and never renders in the production build; it is not part of any route and was excluded from scoring.

## Change surface since closeout

Verified via git. Since the 2026-06-11 closeout, `apps/web/src` saw only the 2026-06-12 robustness-hardening batch (`cff1c45`) touching route files, plus same-day closeout commits. Two routes have a non-cosmetic delta worth recording:

- **Planning (`/calendar`)** — `calendar/page.tsx` lost ~321 lines because pure presentation logic was extracted into `apps/web/src/lib/planning/presentation.ts`. This is a refactor with **no rendered-behavior change**; the fresh screenshots and the `workflow-hierarchy` / `p0-ux-regression` specs confirm the local-first flow, the explicit Google-approval framing, and the flagship hierarchy are unchanged.
- **Areas (`/settings/areas`)** — gained an additive `DataExportPanel` admin disclosure (FR-016 user data export, Google tokens excluded). It sits in the lower admin/registry zone behind disclosure and does not displace the create-area flagship; the fresh Areas screenshots confirm create-first hierarchy and quiet-admin framing are intact.

Neither change reopens a forbidden surface and neither degraded its route's score.

## Worksheet (re-scored from 2026-06-24 evidence)

| Route | First action | Diagnostic staging | Copy maturity | Mobile viewport | Visual hierarchy | Surface restraint | Accessibility | Safety truthfulness | Route identity | Emotional feel | Average | Pass / fail |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AppShell | `2` | `2` | `3` | `2` | `3` | `2` | `3` | `2` | `3` | `2` | `2.4` | `pass` |
| Home | `3` | `3` | `3` | `3` | `3` | `3` | `3` | `3` | `3` | `3` | `3.0` | `pass` |
| Capture | `3` | `3` | `3` | `3` | `3` | `2` | `3` | `3` | `3` | `3` | `2.9` | `pass` |
| Triage | `3` | `2` | `3` | `2` | `3` | `2` | `3` | `3` | `3` | `2` | `2.6` | `pass` |
| Planning | `3` | `3` | `3` | `3` | `3` | `2` | `3` | `3` | `3` | `3` | `2.9` | `pass` |
| Execute | `3` | `3` | `3` | `3` | `3` | `2` | `3` | `3` | `3` | `3` | `2.9` | `pass` |
| Review | `2` | `3` | `3` | `2` | `2` | `2` | `3` | `3` | `3` | `2` | `2.5` | `pass` |
| Health | `3` | `3` | `3` | `2` | `3` | `2` | `3` | `3` | `3` | `3` | `2.8` | `pass` |
| Areas | `3` | `3` | `3` | `2` | `3` | `2` | `3` | `3` | `3` | `3` | `2.8` | `pass` |

App-wide observed average: 24.8 / 9 = **2.76 (~2.8)**. No route fails its threshold.

### What the fresh evidence confirmed, route by route

- **AppShell** — Skip-to-main-content link, `aria-label="Primary"` nav with `aria-current`, 40px touch-target floor, single horizontal nav lane with scroll (no wrap), collapsed quick-note, and quiet-shell-context suppression on `/`, `/capture`, `/calendar`, `/execute`, `/review` all present and correct. Passes, but only at threshold: on mobile the header chrome plus the "Quick capture details" disclosure still consume meaningful first-viewport height on non-quiet routes.
- **Home** — Quiet shell, single "Capture a thought" CTA, read-only instrument-panel identity, calmest route in the app. 3.0.
- **Capture** — Raw-first flagship, writing surface and save action win the first scan, "AI sorting unavailable" renders as a calm degraded state (not an alarm) in local/mock mode — honest safety truth. 2.9.
- **Triage** — Current-item flagship dominant (Accept / Reject / Edit), waiting queue clearly secondary. Mobile first scan is still slightly diluted by the shell "Quick capture details" band above the route body.
- **Planning** — Local-first flagship first; Google framed as explicit separate approval, not ambient capability. Unchanged after the presentation-helper extraction.
- **Execute** — One mission dominant, route-local Start ahead of shell, quiet shell context.
- **Review** — Closure-first flagship with carry-forward metrics; densest desktop route, organized but heaviest — acceptable, watch for upward drift.
- **Health** — Trust-answer-first ("Can I rely on LifeOS today?") ahead of the trust map and repair queue; honest, repair-oriented.
- **Areas** — Create-area flagship first, quiet ownership-registry framing, export/registry detail behind disclosure.

## Docs ↔ implementation agreement

Checked against the latest docs, including the 2026-06-23 operating-layer edits:

- The eight-route navigation list in `docs/UX_FLOWS.md` matches the shipped routes (`/`, `/capture`, `/triage`, `/calendar`, `/execute`, `/review`, `/health`, `/settings/areas`).
- The new "Future Operating-View Containment" section in `docs/UX_FLOWS.md` is explicitly **future-scoped** ("Future project/task operating views should…") and asserts no current capability — no docs↔implementation drift introduced.
- The route contracts in `docs/PROJECT_STATE.md` (lines ~80–104) and the route scorecard in `docs/UI_UX_WORLD_CLASS_ROADMAP.md` match the shipped UI: quiet-route set, collapsed shell quick-note, single primary CTA per route, area context anchored in the persistent shell control, Areas demoted to supporting nav.
- No calendar, auth, parser, schema, RLS, or external-write behavior changed.

## Residual weak spots (re-verified, carried forward from Pass 7)

These are unchanged from the 2026-06-11 closeout and remain the honest weak points, not new regressions:

- **AppShell mobile chrome is still dense.** The "Quick capture details" disclosure still spends first-viewport height above non-quiet route bodies (Triage, Health, Areas).
- **Triage mobile** first scan is slightly diluted by that shell disclosure before the current item takes over.
- **Review** carries the heaviest desktop density among the workflow routes even after the closure-first cleanup.
- **Health and Areas** pass on restraint rather than true minimalism; future maintenance should avoid adding fresh shell/support clutter above them.

## Open UX-relevant known issues (no UI block)

From `docs/KNOWN_ISSUES.md` — both accepted/pending, neither blocks this check:

- **#3** Provider degradation not yet surfaced as Health incidents (INV-5 open) — Health shows subsystem trust state, but AI-provider degradation is not raised as a Health incident. Documented, future hardening slice.
- **#4** Six route pages over the 800-line budget (grandfathered ceilings, INV-4) — technical debt with a paydown rule, not a UX regression.

## Closeout decision

No new pass is warranted. The shipped UI still clears every Pass 7 threshold under fresh 2026-06-24 evidence, docs and implementation agree, and the only post-closeout route changes (Planning refactor, Areas export disclosure) are non-regressive maintenance. Keep the roadmap in maintenance posture; treat the residual weak spots as the first candidates if a future reviewed pass is opened.

Files added by this check (test-only, no product code touched):

- `apps/web/tests/e2e/ui-ux-check-2026-06-24.spec.ts` — **kept on purpose**, mirroring the existing dated `final-audit-packet.spec.ts` convention so this packet stays reproducible from the repo. Like that spec, its filenames are date-stamped; a future dated re-audit should add its own spec rather than re-date this one. Safe to delete if the dated evidence is no longer wanted.
- `apps/web/test-results/2026-06-24-ui-ux-check/*.png` (gitignored evidence)
