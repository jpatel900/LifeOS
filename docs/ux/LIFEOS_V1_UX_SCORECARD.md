# LifeOS V1 UX Scorecard

Use this scorecard during UX-affecting PR review and browser smoke.

Green CI is necessary, but not sufficient, for UX readiness.

## How to score

Score each dimension:

- `0` = failing or misleading
- `1` = acceptable but rough
- `2` = clear, trustworthy, and ready

Release-readiness guidance:

- no `0` on Trust Clarity, Next Action, Area Visibility, Mobile Usability, or External Write Safety
- target total: `24/30` or better
- if the PR changes area accent, also require a pass on the color/accessibility check
- if the PR changes repeated controls, disclosures, loading states, or form structure, also require a pass on the frontend-system alignment check below

## Scorecard

| Dimension                       | 0                                                              | 1                                                                        | 2                                                                                    |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Trust clarity                   | UI leaks internal jargon, fake capability, or misleading state | Mostly truthful, but some wording or states still require interpretation | Clear, plain-language, and honest about what is real, local, pending, or unavailable |
| Area visibility                 | Current area is unclear or color-only                          | Area is visible, but weak or easy to miss                                | Area is obvious through text/chip plus subtle visual treatment                       |
| Next-action clarity             | Screen feels like equal-weight options or clutter              | Main action exists, but competes with secondary content                  | One obvious next move or one clear recovery path                                     |
| Capture friction                | Saving/structuring feels ambiguous or effortful                | Flow works, but outcome or next step is slightly unclear                 | Quick input, clear outcome, clear next step                                          |
| Decision/triage clarity         | Review state is confusing or overloaded                        | Current decision is understandable with some friction                    | One present-tense decision path with clear actions and up-next context               |
| Planning clarity                | Local planning and Google actions blur together                | Mostly clear, but proposal states or reasons still need interpretation   | Local planning, checks, and approval-gated Google actions are plainly separated      |
| Focus usefulness                | Execute feels like controls without guidance                   | Session state is usable but not especially supportive                    | One mission, one state, one clear next move with calm recovery guidance              |
| Review carry-forward usefulness | Review is raw logs or weak summaries                           | Review helps, but follow-through is still vague                          | Review closes the loop and points to a concrete next move                            |
| Visual hierarchy                | Cards/buttons compete equally                                  | Some hierarchy exists, but clutter remains                               | Dominant panels, quieter support surfaces, readable button hierarchy                 |
| Mobile usability                | Overflow, clipping, or dense unusable layouts                  | Mostly works, but small-width friction remains                           | Narrow/mobile view stays readable, actionable, and calm                              |
| Accessibility basics            | Color is the only signal, contrast/focus is weak               | Basic accessibility is present but uneven                                | Color is supplemental, focus-visible is obvious, key status is perceivable           |
| Non-shaming recovery language   | Failure/missed-state wording adds blame or stress              | Neutral but not especially supportive                                    | Recovery language is calm, plain, and action-oriented                                |
| External write safety           | UI implies or hides writes                                     | Approval boundary exists but is easy to miss                             | External actions are explicit, visible, and never implied as automatic               |
| Keyboard/focus behavior         | Primary path is hard to use by keyboard                        | Keyboard path works but feels secondary                                  | Primary actions and state changes remain obvious by keyboard and focus               |
| Diagnostics discipline          | Raw diagnostics dominate daily workflow surfaces               | Diagnostics are available but still too prominent                        | Diagnostics are available without polluting the main workflow                        |

## Area accent check

If the PR changes area accent behavior, explicitly confirm:

- area name or chip remains visible
- color is not the only signal
- selected vs unselected state stays obvious
- dark-mode contrast remains readable
- focus-visible treatment remains obvious

## Frontend system alignment check

If the PR changes shared or repeated UI seams, explicitly confirm:

- the change prefers existing app-local primitives in `apps/web/src/components/ui` before introducing route-local markup
- repeated labels, loading states, and disclosure patterns are not being reimplemented ad hoc
- token-first styling is preserved instead of reintroducing page-local raw colors or bespoke near-duplicates
- the change keeps the product-specific shell and route composition custom instead of flattening the UI into stock shadcn screens

## Review notes template

Use this short format in PR review or issue closure notes:

- Score:
- Weakest dimension:
- Strongest dimension:
- Mobile check:
- Keyboard/focus check:
- Area-accent check:
- Frontend system alignment:
- Remaining risk:
