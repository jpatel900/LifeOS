# UI Pass 7 Final Audit Rubric

Status: Active audit standard for Pass 7 final review
Purpose: Define the route-by-route scoring method, pass thresholds, and proof requirements for GitHub issues `#198` and `#199`
Read when: Preparing the final Pass 7 audit, reviewing route evidence, or deciding whether the roadmap can be closed
Do not use for: Mid-stream implementation status or shipped product truth before the audit is complete
Superseded by: n/a during Pass 7; after closeout this becomes historical audit proof

## Routes in scope

Audit every one of these surfaces:

- `AppShell`
- `Home`
- `Capture`
- `Triage`
- `Planning`
- `Execute`
- `Review`
- `Health`
- `Areas`

## Required evidence before scoring

Do not score a route until all of the following exist for that route or the directly relevant shared surface:

- relevant tests pass
- mobile screenshot evidence exists
- desktop screenshot evidence exists
- rendered behavior proof exists for the exact audited state
- docs and implementation agree
- no forbidden behavior changed

Automatic audit failure:

- missing screenshots
- missing validation proof
- documentation that claims behavior the runtime or tests do not prove
- any calendar, auth, parser, schema, RLS, or external-write behavior change outside approved scope

## Scoring scale

Use the same scale for every dimension:

| Score | Meaning |
| --- | --- |
| `0` | Fails the critique. The route still violates the intended rule badly enough that Pass 7 cannot ship. |
| `1` | Improved but still cluttered, confusing, or under-staged. Acceptable only as an intermediate state. |
| `2` | Acceptable, consistent, and truthful. Not exceptional, but shippable if the full-route threshold passes. |
| `3` | Excellent and product-grade. Clear, restrained, truthful, and polished without fake capability. |

## Dimensions

### 1. First-action clarity

Ask:

- Is the main next action obvious within the first scan?
- Is the route free of competing primary CTAs at rest?
- Does the route still work when the user is stressed or scanning quickly?

### 2. Diagnostic staging

Ask:

- Are system details staged after the main task instead of before it?
- Are developer details either absent from the primary route or intentionally pushed into details or Health?
- Do blocked states justify showing diagnostics up front?

### 3. Copy maturity

Ask:

- Is the copy user-facing rather than implementation-facing?
- Is the tone calm, plain-language, and non-shaming?
- Does the route avoid fake precision or internal jargon on primary surfaces?

### 4. Mobile first viewport

Ask:

- At mobile width, does the first viewport show the main action before support clutter?
- Are cards, disclosures, and metrics kept within the documented surface budget?
- Does the route avoid wrapped chrome or dense stacked support surfaces?

### 5. Visual hierarchy

Ask:

- Is there one clear center of gravity?
- Are support and admin surfaces visibly secondary?
- Do spacing, typography, and grouping guide the eye without force?

### 6. Surface restraint

Ask:

- Are there fewer containers, borders, accents, and stacked disclosures than before?
- Does the route feel calmer rather than merely decorated differently?
- Did the pass simplify structure before styling it?

### 7. Accessibility basics

Ask:

- Is focus visible?
- Are target sizes usable?
- Is contrast acceptable in the actual shipped theme system?
- Are status semantics understandable without color alone?

### 8. Safety truthfulness

Ask:

- Does the route explain what is local, persisted, optional, or approval-gated truthfully?
- Are degraded states severity-appropriate?
- Are recovery steps explicit where the user might otherwise misread the state?

### 9. Route identity

Ask:

- Does the route read like its intended role rather than a generic template?
- Is the route purpose legible before reading every label?
- Does the route preserve the authored LifeOS feel without flattening into stock UI?

### 10. Overall emotional feel

Ask:

- Does the route feel calm, competent, and low-friction?
- Would a user trust it more after the pass than before?
- Does the route feel like an instrument panel or workflow tool rather than admin clutter?

## Pass thresholds

All of these must be true:

- no dimension may score `0`
- route average must be at least `2.4`
- `Capture` average must be at least `2.7`
- `Home` average must be at least `2.7`

Program-level rule:

- Pass 7 does not pass if any audited route fails its threshold, even if the average across the whole app looks good.

## Audit worksheet

Use one row per route.

| Route | First action | Diagnostic staging | Copy maturity | Mobile viewport | Visual hierarchy | Surface restraint | Accessibility | Safety truthfulness | Route identity | Emotional feel | Average | Pass / fail | Evidence links |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AppShell |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Home |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Capture |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Triage |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Planning |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Execute |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Review |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Health |  |  |  |  |  |  |  |  |  |  |  |  |  |
| Areas |  |  |  |  |  |  |  |  |  |  |  |  |  |

## Closeout rule

- `#199` may close only after this rubric is filled out with real evidence and every threshold passes.
- If docs and implementation disagree, fix the disagreement first. Do not average the contradiction away.
