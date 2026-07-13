> Provenance: GPT-5.6 (Codex) audit commissioned by the owner, delivered 2026-07-13;
> preserved verbatim as the canonical UX-debt source for epic #555. Image links
> referenced the auditor's local machine and are omitted here. Companion findings
> from the same-day Fable owner-lens drive: issues #551-#553.

# LifeOS UI/UX Audit

## Verdict

You are right that UX is the main product bottleneck — but "world-class" should not mean prettier. LifeOS's problem is currently interaction architecture, coherence, and trust.

Directional score:

- Product doctrine: **8.5/10**
- Visual craft: **7/10 on Moments Home; 5/10 on workflow routes**
- Experienced product UX: **4.2/10**
- World-class readiness: **not close yet**

The core journey works, and the underlying ideas are unusually strong: WIP refusal, first-move gating, non-shaming recovery, area scope, explicit calendar approval. But the UI often hides, duplicates, or contradicts those ideas.

Audit scope: `feat/design-d1-surfaces` at commit `715e4da2`, local demo mode, Chromium at 1440x1000 and 390x844, all primary routes, the complete capture-triage-plan-execute-review journey, keyboard/accessibility structure, contrast, and responsive behavior. No files were changed.

## Scorecard

| Dimension                |  Score | Assessment                                                                        |
| ------------------------ | -----: | --------------------------------------------------------------------------------- |
| Information architecture | 2.5/10 | Two competing shells; URL and rendered state can disagree                         |
| Capture                  |   4/10 | Fast and visually clean, but violates the explicit containment contract           |
| Triage                   |   6/10 | Strong one-item decision model; transition/loading truth is weak                  |
| Planning                 |   3/10 | Duplicate scheduling models and poor mobile sequencing                            |
| Execute                  |   6/10 | Best workflow surface, but missing required first-move and outcome detail         |
| Review/re-entry          |   6/10 | Excellent doctrine; premature and misleading completion language                  |
| Trust/state truth        |   3/10 | Contradictory persistence, counts, route state, and fake affordances              |
| Mobile                   |   3/10 | Responsive technically, but largely a compressed desktop interface                |
| Accessibility            |   4/10 | Some solid semantics; multiple target, contrast, labeling, and hierarchy failures |
| Onboarding               |   2/10 | Essentially a developer login plus settings page                                  |
| Emotional quality        | 6.5/10 | Calm and non-shaming, but friction and contradictions damage enjoyment            |

## What is already good

- The Moments Home is calm, restrained, and far less bureaucratic than the legacy cockpit.
- The core mock journey is completable end to end.
- Demo mode is made visually obvious.
- Calendar writes remain visibly separate from local planning.
- Execute has a strong single-task visual centre, clear outcomes, pause, and side capture.
- The PWA/share-target direction is strategically correct.
- No horizontal overflow appeared at 390px on the tested routes.
- The non-shaming re-entry, WIP limit, approval gates, and first-move philosophy are genuine differentiators.

The product thinking is better than the UI execution.

## Critical findings

### P0 — LifeOS is two products sharing one URL space

The new Moments Home and the old workflow cockpit do not form one coherent shell.

Observed:

- Clicking "LifeOS" from `/calendar` changes the URL to `/` but continues rendering the old cockpit Today screen.
- Refreshing that exact URL replaces it with the new Moments Home.
- Browser Back changed `/calendar` to `/capture` while the screen still displayed "Hour rail."
- "View area health" on Moments Home does not open `/health`; it shows "Area health is on the roadmap," despite a health route existing.
- Settings and Health are effectively undiscoverable from the live home.

This is the highest-priority defect. A URL must represent one screen, regardless of how the user arrived there.

Sunsama publicly described essentially this failure mode — workflow views being "tacked on" until navigation became clunky — before redesigning its navigation around those workflows. [Sunsama Navigation 2.0](https://roadmap.sunsama.com/changelog/navigation-20)

### P0 — Capture violates LifeOS's own defining UX contract

The UX contract (docs/UX_FLOWS.md, capture flow) requires the raw thought and return hook to remain visible during parsing, followed by a "back to" conclusion.

Observed on Moments Home:

- Pressing Enter immediately closed the capture dialog.
- The raw thought and return hook disappeared.
- Only "Capture resolving…" remained.
- No "back to: …" conclusion appeared after parsing.

Observed on `/capture`:

- Saving immediately navigated to Triage.
- Triage displayed "Inbox clear" while also displaying "Parsing capture into drafts…"
- The toast claimed "Saved; waiting in Triage" before anything existed in Triage.

Additional problems:

- Task / Note / Idea chips are ignored by the save handlers. They are cosmetic choices.
- The visible action is "Save raw"; parsed save is keyboard-only through Enter.
- Shift+Enter is required for a newline, which is particularly poor on mobile.
- Execute's side capture starts parsing in the background without the containment or return-hook behavior.

This is not a polish problem. It breaks one of LifeOS's most distinctive product decisions.

### P0 — State and copy frequently lie

Examples:

- Banner: "nothing here is saved." Simultaneous workflow notice: "Capture saved locally" or "account sync is pending."
- The Capture pipeline badge counts historical capture rows, so it grows permanently instead of representing work requiring attention.
- The Review badge similarly includes historical sessions.
- Review says "Day closed clean" before the user presses "Save review."
- The Health ring is a clickable system-check control with no accessible name.
- Moments Home's health CTA is visually real but functionally fake.

World-class products are predictable before they are beautiful. Every count should be actionable, every CTA real, and every state label literal.

### P0 — Planning has two competing mental models

During the tested journey:

1. Parsing automatically created a 12pm proposal.
2. The task was manually placed at 8am on the hour rail.
3. The 12pm proposal remained active.
4. The interface warned that accepting it would add another scheduled block.

The user is being asked to understand both:

- direct hour placement; and
- proposal drafting/acceptance.

There should be one canonical planning object. Direct placement should consume or supersede the pending proposal.

Mobile makes this worse: the user scrolls through eleven empty hour cards before reaching "To place." The empty mobile Plan page was 2,040px tall.

Sunsama's better pattern is task selection, workload/capacity check, optional timebox, then finalize plan. [Sunsama Daily Planning](https://help.sunsama.com/docs/usage-guides/daily-planning/)

### P1 — Mobile is responsive, but not mobile-designed

Measured at 390x844:

- The Capture pill overlaps the Pipeline disclosure by **29.5px**.
- The Pipeline summary itself is only **16px high**.
- The area selector is **31px high**.
- Many cockpit header controls are **40px**, below the project's 44px standard.
- Capture overlay "Save raw" and "Close" hit regions overlap by **8px**.
- Execute's actual focus content begins around 517px down the page after banner, header, notices, and stage rail.
- The route header wraps area choices into multiple rows before any useful content.

Apple recommends at least 44x44pt for primary touch targets; WCAG 2.2 AA requires at least 24x24px or sufficient spacing. [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/accessibility), [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)

Mobile needs a compact shell — probably one area selector, a bottom workflow navigator, and safe-area-aware capture — not wrapped desktop chips.

### P1 — Accessibility is below a world-class bar

Concrete findings:

- Moments Home begins at `h2`; it has no `h1`.
- `/capture` has no heading.
- The Health ring button has no accessible name.
- Capture textareas rely on placeholder text rather than persistent labels.
- No skip-navigation mechanism exists; workflow content can follow 15 header/navigation controls.
- The command palette input lacks a complete combobox/`aria-activedescendant` pattern.
- Global Enter shortcuts do not exclude buttons and links, risking shortcut actions firing alongside normal activation.
- `--fnt` contrast is approximately **3.33:1** on dark cards and **1.92-2.34:1** on light surfaces.
- That token is used for small labels and metadata; WCAG AA requires 4.5:1 for normal text. [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### P1 — Execute and Review do not fully deliver their contracts

Execute is currently the strongest stage, but:

- It shows the definition of done, not the required first tiny physical move.
- Completing/stuck/missed is immediate; the required actual-duration, productivity, distraction, and notes step is absent.
- "Partial" and "skipped" are absent.
- Side capture invokes parsing when a raw, synchronous save would better preserve focus.
- Review announces closure before closure is saved.

The right model is:

- focus screen: task, first physical move, time truth, DoD;
- end sheet: outcome, actual duration, optional note;
- only then: closed-state verdict.

### P1 — First-use experience is not product-ready

The login screen says "Local Supabase Login" and "test saved account flows," with test credentials prefilled. It routes to Areas settings rather than a coherent setup ritual.

The required under-five-minute onboarding — confirm areas, work window, session length, optional calendar, first capture — is not present.

Do not fix this with a tooltip tour. Build a three-step setup that creates immediate value.

### P2 — Visual polish is split and partially unstable

The Moments Home has a promising visual language. The workflow routes still use:

- large rounded containers for nearly everything;
- many equal-weight panels;
- persistent high-volume chrome;
- eleven repetitive calendar cards;
- two different typography/layout systems.

Typography also depends on a Google Fonts `@import`. Hanken Grotesk and IBM Plex Mono are requested, while other styles reference Fraunces and IBM Plex Sans without loading them. Rendering therefore varies by OS and network state.

The existing design review correctly identified excessive chrome and card competition. The migration stopped at Home.

## Comparison with world-class patterns

| Product | What it gets right                                                                                                                                                                                                                                                                                                                                               | LifeOS implication                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Things  | Quick Entry from anywhere; Quick Find combines instant search and navigation; Today/Someday are simple, stable concepts. [Quick Entry](https://culturedcode.com/things/support/articles/2249437/), [Quick Find](https://culturedcode.com/things/support/articles/2803584/)                                                                                       | One capture surface and one global navigation/search model                                                |
| Sunsama | Guided planning reflects on yesterday, builds a realistic workload, optionally timeboxes, then explicitly finalizes the day. [Daily Planning](https://help.sunsama.com/docs/usage-guides/daily-planning/)                                                                                                                                                        | Turn Plan into a short commitment ritual, not a dashboard                                                 |
| Akiflow | Command Bar creates, edits, schedules, and navigates; Inbox is cleanly separated from Today; scheduled tasks remain visible in Today. [Command Bar](https://product.akiflow.com/help/articles/6483573-command-bar), [Inbox](https://product.akiflow.com/help/articles/5284502-your-inbox), [Today](https://product.akiflow.com/help/articles/0741055-today-page) | One canonical task/block relationship and a truly global command surface                                  |
| Todoist | An obvious mobile add control plus natural-language Quick Add keeps capture extremely low-friction. [Todoist task capture](https://www.todoist.com/help/articles/introduction-to-tasks-080OAXric)                                                                                                                                                                | Make the visible mobile action sufficient; keyboard shortcuts should accelerate, not unlock functionality |

Do not use Motion as the north star. Autonomous reshuffling conflicts with LifeOS's approval and calmness doctrine. Borrow capacity visualization, not autonomous behavior.

## Recommended sequence

| Order | Work                                                                             | Impact                                    | Effort |
| ----: | -------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
|     0 | Freeze further shadow/radius/surface passes                                      | Prevents polishing the wrong architecture | S      |
|     1 | Replace manual `pushState`; establish one shell and one renderer per URL         | Removes the largest trust failure         | M-L    |
|     2 | Reuse one capture component everywhere and implement FR-026 literally            | Restores LifeOS's core differentiator     | M      |
|     3 | Correct persistence copy, badge semantics, fake CTAs, and premature closure copy | Restores state truth                      | S-M    |
|     4 | Collapse planning into one task-block model; make mobile task-first              | Removes the largest workflow burden       | L      |
|     5 | Make Focus and Close contract-complete                                           | Converts planning into reliable execution | M      |
|     6 | Rebuild the mobile shell and complete accessibility remediation                  | Makes daily use viable                    | M      |
|     7 | Add minimal onboarding, self-host fonts, then finish visual polish               | Improves adoption and enjoyment           | M      |

Do not maintain both cockpit models indefinitely. Migrate each stage into the Moments shell, then delete the legacy presentation path.

## Acceptance bar before more feature work

- Back/Forward, refresh, and direct URL entry always render the same screen.
- Health and Settings are reachable in at most two interactions.
- Capture opens in one action, saves raw synchronously, and keeps raw text plus return hook visible throughout parsing.
- Every pipeline badge represents unresolved/actionable work.
- A task can become a local block through one scheduling model in at most three intentional actions.
- Mobile exposes the primary action in the first viewport and has zero overlapping controls.
- All important touch targets are at least 44x44px.
- Focus shows task, area, first move, timing truth, and definition of done.
- "Closed" appears only after the review has actually persisted.
- A seven-day real-use trial produces no moment where you need to refresh to fix navigation or wonder whether work was saved.

## Bottom line

LifeOS should not receive another general visual-polish pass yet.

The immediate product objective should be:

> Make LifeOS feel like one calm, truthful instrument from capture through closure.

The strategy is strong enough to compete with world-class systems. The current shell, routing, state semantics, and mobile planning experience are not.

### Evidence and limitations

- Audited in local demo mode via Playwright Chromium probes over `/`, `/capture`, `/triage`, `/calendar`, `/execute`, `/review`, `/health`, `/areas`, and `/settings/areas`; complete capture-through-review journey verified in one browser context.
- UNVERIFIED by the auditor: authenticated production UI, real OpenAI latency/failure behavior, connected Google Calendar confirmation, production performance, offline installed-PWA behavior, and human screen-reader use.
- Repo note added at preservation time: the audit ran against branch `feat/design-d1-surfaces` (715e4da2), which predates main; the "production Health truthfulness" open issue it cites was resolved on main by PR #333 (2026-07-04) and extended by PR #545 (2026-07-13).
