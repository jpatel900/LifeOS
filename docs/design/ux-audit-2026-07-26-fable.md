> Provenance: Claude (Fable) audit #2, commissioned by the owner as the standing
> post-milestone re-run of `docs/design/ux-audit-2026-07-13-codex.md` (issue #586,
> epic #555). Same eleven dimensions, same /10 scale, same P0/P1/P2 severity
> classes, same "world-class patterns" comparison set. Screenshots stayed out of
> the repo; every finding names the route, the viewport, the click path and the
> literal on-screen text so it can be reproduced in about a minute.

# LifeOS UI/UX Audit #2

## Verdict

The remediation was real, and in places it is now genuinely good. Capture
containment, the focus screen and its end-of-session sheet, the onboarding
ritual, the mobile shell, accessibility and contrast all improved substantially.
The single planning model landed: placing a task on the hour rail creates a real
block, supersedes its pending proposals, and survives a reload.

What holds LifeOS back now is different from what held it back in July. Audit #1
found a product that hid its good ideas behind two shells and copy that told
small lies. Audit #2 finds a product that says the right things and then, at
three specific moments, quietly loses or invents your work: a focus session ends
itself when you look at another screen and records an outcome you never chose; a
session started on an unscheduled task keeps nothing at all; and closing the day
never once tells you the day is closed.

The good news is how small the remaining list is, and how much of it is
plumbing rather than design.

Directional score:

- Product doctrine: **8.5/10** (unchanged — the ideas keep getting better)
- Visual craft: **7.5/10 on the moments home; 5/10 on the cockpit routes; 5.5/10 on Settings**
- Experienced product UX: **5.0/10** (was 4.2)
- World-class readiness: **not yet — much closer on surface and access, still short on trust**

Audit scope: `origin/main` @ `21b54267`, local dev server from a clean worktree on
port 3611, Supabase configured against the local stack, Chromium at 1440x1000 and
390x844. Three brand-new accounts (zero rows in `areas`, `capture_items`,
`tasks`) were created through the auth admin API so the first-run experience was
genuine. The complete capture → triage → plan → execute → review journey was
driven end to end, and every persistence claim the UI makes was checked against
the database with the signed-in user's own token. Drive window: 2026-07-25
21:14–23:35 local. No application files were changed.

## Scorecard

| Dimension                |  Score | Delta | Assessment                                                                      | What changed since 07-13                                                                         |
| ------------------------ | -----: | ----: | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Information architecture |   5/10 |  +2.5 | One URL renders one screen on entry; in-app navigation is still invisible to it | Legacy routes redirect correctly; three shells and a URL-blind moment switch remain              |
| Capture                  |   7/10 |    +3 | FR-026 containment is delivered and it feels good                               | Raw text stays put, a real "back to:" conclusion lands; the buttons still read as plain text     |
| Triage                   |   5/10 |    −1 | Best decision model in the app, undone by state that does not stick             | Plain outcomes and a first move added; sorted work reappears unsorted and Sort can hang forever  |
| Planning                 |   5/10 |    +2 | One canonical model finally works; the old one is still on screen beside it     | Placement creates a real block and supersedes proposals; unplaced tasks still appear three times |
| Execute                  |   5/10 |    −1 | The best screen in the product, wired to a session that navigation can kill     | First move + full end sheet added; a moment switch silently ends the session as "partial"        |
| Review/re-entry          | 4.5/10 |  −1.5 | Premature "closed" became no "closed" at all                                    | Wins and weekly-rollup panels are new and good; closing the day confirms nothing, ever           |
| Trust/state truth        | 3.5/10 |  +0.5 | Fewer lies in the copy, more work quietly lost or invented behind it            | Badges and CTAs got honest; persistence, audit trails and health all-clears did not              |
| Mobile                   | 6.5/10 |  +3.5 | A real mobile shell with clean targets; a few desktop assumptions left inside   | Bottom navigator; 0 targets under 44px and 0 overlaps everywhere measured                        |
| Accessibility            | 7.5/10 |  +3.5 | The biggest, cleanest win in the whole remediation                              | h1s, skip-nav, labels, a proper combobox palette, contrast at AA                                 |
| Onboarding               |   4/10 |    +2 | A good three-step ritual that new accounts never reach                          | Ritual built and skippable; the sign-in path bypasses it entirely                                |
| Emotional quality        |   5/10 |  −1.5 | Calm and kind, but the payoff moments are blank or, worse, wrong                | Language improved throughout; finishing something still feels like nothing happened              |

## What is already good

These are not consolation prizes. Several are at or near the bar.

- **Capture containment is real.** Press `c`, type, press Enter: the raw thought
  stays on screen, `back to: reading the sponsor email` appears as the promised
  conclusion, then `Captured — it's in your triage pile.` with an `Open triage`
  link. Capture is a pure raw save now — no forced parse, no queue.
- **One planning model, and it persists.** On `/calendar`, click a task in
  `TO PLACE`, then a row on the hour rail: the row becomes
  `9a — Write the volunteer rota for next weekend / Tap to unplan`, a
  `calendar_blocks` row is written with `status: "scheduled"`, that task's
  pending proposals flip to `superseded`/`accepted`, and the whole thing survives
  a reload. Epic #555 item 4's ratified behaviour ("placement wins") is shipped.
- **The end-of-session sheet is contract-complete.** Outcome (`Done` /
  `Partial` / `Skipped` / `Stuck`, each with a plain hint like
  `Blocked — needs a smaller step.`), `Actual duration (minutes)`,
  `Note (optional)`, Cancel/Save. In the one clean run observed — a session on a
  task with a scheduled block, ended without navigating away — it saved correctly
  (`outcome: completed, actual_minutes: 35, notes: …`) and the Close moment
  updated to `1 COMPLETED TODAY`. That is one observation, not a proven general
  property; the two failure paths below were each seen more than once.
- **The focus screen shows the first move**, not just the definition of done:
  `First move — Clarify the next concrete step for: Call the accountant about the
quarterly filing`, beside a live countdown, `Pause` and `+25 min`.
- **Accessibility went from a liability to a strength.** Every audited surface
  has an `h1` and a `Skip to stage content` link; zero unnamed buttons or links
  and zero unlabeled inputs were found anywhere; the command palette is a proper
  combobox (`role="combobox"`, `aria-expanded`, `aria-controls`,
  `aria-activedescendant`, `aria-autocomplete="list"`,
  `aria-label="Search commands"`). Contrast is effectively at AA — the only
  failing text node found on any route was the `◆` logo glyph at 3.98:1.
- **The mobile shell is a mobile shell.** A fixed bottom navigator
  (Start / Flow / Close / Capture / Settings), and across every mobile surface
  measured, **zero** interactive targets under 44x44 and **zero** overlapping
  controls — against audit #1's 29.5px overlap, 16px pipeline summary and 31px
  area selector. The mobile home is 844px tall and the mobile `/calendar` is
  1067px, against audit #1's 2,040px empty Plan page.
- **Health reads like a person wrote it**: "Everything is working — Nothing needs
  you right now", four plain sections, and a Mirror block that explicitly says
  "Observation only — these gauges describe the system, not you."
- **The fake CTA is real.** `View area health →` on the Start moment now
  navigates to `/health`. Settings is one click from the home (the gear beside
  Sign out). Both audit #1 acceptance-bar items pass.
- **Old bookmarks keep working.** `/capture`, `/triage`, `/calendar`, `/execute`,
  `/review` all 307-redirect into `/` with the right deep-link parameter, and
  refresh and direct entry render the same screen.
- **Close has grown a re-entry story**: `WINS & EVIDENCE` (`Skip` / `Log win`)
  and `WEEKLY ROLLUP` with `Highlights:` and `Dismiss` / `Approve rollup`, plus
  `TOMORROW'S FIRST MOVE` naming the oldest active commitment.

## Critical findings

### P0 — Switching moments silently ends your focus session and files an outcome you never chose

Route `/`, desktop 1440x1000, signed in, with a task scheduled at 10a.

Steps: `Start now` on the Start moment → a session runs (`59:55`, `Done — log
it`, `Pause`, `+25 min`, first move shown) → click `Flow` in the masthead (the
session is correctly still there, `59:51`) → click `Start` in the masthead.

Observed:

- The hero is back to `Start now` / `Snooze 10m` / `Not this →`. The countdown is
  gone. The pipeline `Execute` badge goes from `1` to `0`.
- No dialog, no confirmation, no toast, no explanation.
- The database gained a new `execution_sessions` row:
  `outcome: "partial", actual_minutes: null`.

The app decided on the user's behalf that the block was a partial, and wrote it
to their record, because they clicked a tab and clicked back. This is the most
damaging finding in the audit: it is silent, it is easy to trigger, and it
corrupts the one dataset the whole review and health story is built on.

### P0 — A session started on an unscheduled task keeps nothing, and says nothing

Route `/`, desktop, signed in, with tasks accepted but **no** block placed.

`Start now` still starts a complete session: countdown, first move, `Done — log
it`, the full end sheet. Select `Done`, enter `35` minutes, write a note, click
`Save`.

Observed:

- A toast reads `Session complete`, then disappears.
- `execution_sessions` gains **no row** (no request to that table is made).
- The task stays `status: "active"`, and `/?moment=close` still reads
  `0 COMPLETED TODAY`.
- The code has a truthful fallback for exactly this case —
  `persistMarkedSession` (`lib/workflowContext/persistenceSync.ts`) calls
  `markLocalOnly("Your focus session result … saved on this device")` when there
  is no persisted session id — and **that banner never rendered**.
- The screen after saving is the **Flow** moment reading `No block running —
Start your first move from Start`, while the URL still says `?moment=start`.

So the same button (`Start now`) leads to a session that is saved or a session
that evaporates, depending on invisible state, and the app never distinguishes
the two.

### P0 — Work you already triaged comes back untriaged

Route `/?sheet=triage`, desktop, **new browser session** after a full journey.

Observed on one account at the same moment:

- The triage drawer lists both thoughts under `Captured, not sorted yet`, each
  with `Main Job · Saved as you wrote it — sorting it into a task is the next
step here.` and a `Sort` button.
- The Start moment shows the same two items as accepted work: `Call the
accountant about the quarterly filing / 25 min · Main Job / Oldest active
commitment` with `Start now`, and `TODAY'S FOCUS — Write the volunteer rota for
next weekend`.
- The hero line reads `2 thoughts waiting for a decision.` — decisions already
  made.

Database: both `capture_items` rows still carry `status: "new"` although
`tasks.source_capture_item_id` points at them. The capture's status is never
advanced when it is sorted and accepted, so every fresh load resurrects it.

Audit #1 asked that "every count be actionable". This is worse than a count: it
is the work itself, offered back to the user as undone.

### P0 — Closing the day confirms nothing, and can be done forever

Route `/?moment=close`, desktop, signed in, with `1 COMPLETED TODAY` genuinely
recorded.

Click `Close the day`. Observed:

- Nothing changes. The screen before, one second after, eight seconds after, and
  after a hard reload are identical — `Close the day` still sitting there,
  `Closing saves today's counts as reviewed and carries forward anything still
open.` still describing a future action.
- There is no closed state anywhere in the UI, at any point.
- The button can be pressed indefinitely. `review_entries` holds **five** rows
  for the single date `2026-07-26`.
- On an earlier run a toast did appear —
  `Day closed — saved on this device and not in your account yet` — while
  `/settings/areas` in the same session displayed `Save mode: Saved to account`.

Audit #1's finding was "Review says 'Day closed clean' before the user presses
Save". The premature verdict was removed and never replaced. Its acceptance-bar
item — _"Closed" appears only after the review has actually persisted_ — now
fails from the other direction.

### P0 — A brand-new account never sees the onboarding ritual

Route `/login` → `/`, desktop and 390px, three genuinely empty accounts.

Sign in with an account that has zero `areas` and zero `capture_items`.

Observed:

- The app lands on `/` and renders the **Close** moment: `LifeOS Today`,
  `0 COMPLETED TODAY`, `0 MISSED TODAY`, `Nothing to carry forward — today's
missed blocks are clear.`, `Close the day`. The first screen a new person ever
  sees is an end-of-day summary of a day they have not had. (Close is
  auto-selected by time of day; the drive ran at 21:14.)
- The area selector shows `Main Job` — one of four hard-coded demo areas the
  account does not own.
- `onboarding-ritual` is absent; `localStorage` holds no onboarding keys.
- **No request to `/rest/v1/areas` is made at all on this path.** The client
  keeps its seeded demo areas, so the zero-state predicate (`areaCount === 0 &&
captureCount === 0`) can never become true.
- **A manual full page reload of `/` fixes it**: about five seconds after the
  reload the areas read fires and the screen jumps from the Close moment into
  `SETUP · STEP 1 OF 3 — Your areas`.

The three-step ritual shipped for epic #555 item 7 is therefore reachable only by
someone who happens to refresh. That is audit #1's oldest complaint — _"no moment
where you need to refresh to fix navigation"_ — reappearing on the most important
screen in the product.

The ritual itself, once reached, is good: `Your areas` (editable chips, `Add
area`, `Skip — keep the defaults`, `Continue`), `Your day` (work start/end,
`Focus session length` 25/45/60, and a quiet `Optional: connect Google Calendar
in Settings — LifeOS only ever writes to it with your explicit approval.`), and
`One thought to start`. Every step has an `h1`, every step is skippable, and no
target is under 44px at 390px.

### P1 — Health says "Everything is working" while its own reads are failing

Route `/health`, desktop, signed in.

The page shows `Everything is working`, `Nothing needs you right now`,
`Your work and account — All good.`, `Connected apps — All good.`,
`What leaves this app — All good.`

On that same page load:

- Four requests return **400** and two return **403**.
- `suggestion_records` and `override_records` return `42501 permission denied for
table` — not a browser artifact: the same denial reproduces from a direct REST
  call carrying the owner's own JWT, for reads **and** writes. Every triage
  decision therefore fails to record its audit trail (two
  `POST … /suggestion_records` 403s per decision), silently.
- The four Mirror gauges consequently read `No reading yet.` — a broken read
  presented as neutral emptiness.
- The health record the page saved to the account is
  `subsystem: "mock mode"` with the summary `This device can keep your work on
its own, so nothing is lost if your account cannot be reached.` — for a
  signed-in account whose database is reachable.
- `Connected apps — All good.` is shown with nothing connected.

A surface whose whole job is truth-telling is the last place an unconditional
all-clear belongs.

### P1 — `Sort` hangs indefinitely with no timeout and no failure state

Route `/?sheet=triage`. Click `Sort` on an unsorted capture.

Observed in **two of five** attempts (once at 1440px, once at 390px): the button
changes to `Sorting…` and stays there. Forty seconds later the row still reads
`Captured, not sorted yet` and the button still reads `Sorting…`. In the three
successful attempts the sort finished in under two seconds and produced a proper
draft. In one hanging session the browser had just logged an aborted
`auth/v1/user` request and `TypeError: Failed to fetch`.

The component already has the right failure UI — an amber card with
`AI can't be reached…`, a `What happened?` disclosure and a degraded-mode retry.
It can never render for this class of failure because `captureParse.phase ===
"parsing"` has no timeout and no transition out. `Sort` is also `disabled` for
every other row while one sort is in flight, so a single stuck sort freezes the
whole triage queue.

### P1 — In-app navigation is invisible to the URL and to history

Route `/?moment=start`, desktop.

- Click `Flow` in the masthead: the screen becomes the Flow moment; the address
  bar still reads `/?moment=start`.
- Press browser **Back**: the app lands on `/health` — two navigations back,
  skipping the moment change entirely.
- Press **Forward**: `/?moment=start`, Start moment. **Reload**: Start moment.
- Separately, saving an end-of-session sheet renders the Flow moment while the
  URL still reads `?moment=start`.

Entry is coherent now (direct URL, refresh and the legacy redirects all agree),
which is a genuine repair of audit #1's worst defect. Movement inside the app is
not. Anyone who uses Back as an undo will be thrown somewhere unrelated.

### P1 — Three shells, three design languages

- `/` — the moments shell: `LifeOS · Today`, the Start/Flow/Close switcher, a
  keyboard legend, a persistent capture bar.
- `/calendar`, `/health`, `/areas` — the legacy cockpit: `◆ LifeOS`, area chips,
  a six-cell stage rail, `Hour rail`, eleven repeated cards.
- `/settings/areas` — a third shell: `LifeOS · Settings` with `Cockpit` /
  `Areas admin` tabs, no moments masthead, no capture bar, no keyboard legend.

Audit #1 called this "two products sharing one URL space" and made it the top
defect. The URL half was fixed; the one-shell half was not, and a third shell was
added.

The legacy cockpit rail also still counts the wrong things. After two thoughts
were captured, sorted and accepted, one block placed, one session completed and
five day-closes written, it read `1 Today · 2 Capture · 0 Triage · 1 Plan ·
1 Execute · 1 Review` — `2 Capture` for two captures that are no longer waiting
on anything, and `1 Review` against five saved review entries.

### P1 — Planning shows one unplaced task three times, in three framings, at two durations

Route `/calendar`, desktop, one task placed and one not.

On a single screen the unplaced task appears as:

- `TO PLACE — Call the accountant about the quarterly filing · 60m`
- `PROPOSALS — Call the accountant about the quarterly filing · 10p · 45m ·
proposed` with `Accept local`, `Move later`, `Reject`
- `CALENDAR APPROVAL — Call the accountant about the quarterly filing · 22:50 ·
local proposal` with an `Approve Google event` button, immediately under
  `Google Calendar isn't set up on LifeOS yet.`

The underlying model is now single and correct, but the presentation still has
two competing surfaces and one action (`Approve Google event`) for an integration
that does not exist. The auto-created proposal is also placed at `10p`, outside
any plausible work window, and nobody asked for it.

The same task carries four different durations depending on where you look:
`~30–60m` in the triage draft, `60m` in `TO PLACE`, `45m` in the proposal, and
`25 min` on the Start hero and the Close moment.

### P2 — Copy and affordance nits that cost more than they look like

- **Mobile's primary hero tells you to press a key.** The largest card on the
  390px home reads `Capture a thought / Press c to open capture.` There is no `c`
  key on a phone; the bottom navigator's `Capture` button is the real answer and
  goes unmentioned.
- **Capture's own buttons do not look like buttons.** In the overlay, `Capture`
  and `Close` are right-aligned plain text with no chrome; `Close` is the lowest
  contrast text in the dialog.
- **An empty return hook is echoed as if it had been typed.** Leave the optional
  "What were you doing?" field blank and the conclusion still prints
  `back to: what you were doing` — a promise to point you back to something you
  never named. Fill it in and it correctly reads `back to: reading the sponsor
email`.
- **Two capture calls to action in one viewport**: the `Capture a thought` hero
  card and the persistent bottom bar `Something on your mind? Capture it — don't
hold it.` say the same thing.
- **A cleared triage tells a new user's story.** After deciding everything the
  drawer reads `Nothing waiting in triage — press C to capture the first thing.`
  after two things were already captured.
- **The Start hero contradicts itself in one sentence**: `No blocks on the
calendar today — 2 of 3 focus slots filled.`
- **The triage drawer opens over whatever moment you were on** — mine opened over
  `Close the day` — with no scrim and the masthead clipped mid-word (`Clo…`) at
  the drawer's edge.
- **Large empty regions on every desktop surface.** Start, Flow and Close all end
  their content between 500px and 650px in a 1000px viewport; Flow's is a
  full-width placeholder card containing one sentence.
- **`Skip to stage content` is 32x16px**, and the Start moment's `2 thoughts
waiting for a decision.` control is 24px high — the only two sub-44px targets
  found on the moments surfaces.
- **The palette cannot find Health.** Ctrl+K opens it correctly, but typing
  `heal` returns `No commands match "heal" — try a different word or clear the
search.`
- **The sign-in door still prefills developer credentials**
  (`user_a@example.test` / `password123`) outside production. It is guarded from
  production builds, but it is the first screen every new person sees in any
  non-production deploy.
- **A React hydration mismatch throws on the moment and sheet URLs**
  (`/?moment=flow`, `/?moment=close`, `/?sheet=triage`, `/?sheet=plan`):
  `Hydration failed because the server rendered HTML didn't match the client. As
a result this tree will be regenerated on the client.` Observed in dev, but the
  divergence itself lives in the source.

## Comparison with world-class patterns

The same reference set as audit #1, re-scored against what changed.

| Product | What it gets right                                                                        | LifeOS today                                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Things  | Quick Entry from anywhere; Quick Find is one global search-and-navigate                   | **Mostly closed.** One capture component everywhere; a real combobox palette. It still cannot find "Health" from "heal" — make search fuzzy.     |
| Sunsama | Planning is a short commitment ritual: pick, check capacity, optionally timebox, finalize | **Half closed.** The model is now single and it persists; there is still no finalize step and the proposals column keeps a second surface alive. |
| Akiflow | One canonical task↔block relationship; Inbox cleanly separated from Today                 | **Still open.** A task can be an unsorted capture, a to-place task, a proposal and a Google approval row at the same time.                       |
| Todoist | The visible mobile action is sufficient; shortcuts accelerate, never unlock               | **Nearly closed.** The bottom navigator makes every action reachable by thumb; the hero copy still tells phone users to press `c`.               |

Motion remains the wrong north star, for the same reason as before: autonomous
reshuffling conflicts with LifeOS's approval-and-calm doctrine.

## Recommended sequence

| Order | Work                                                                                                                       | Impact                                      | Effort |
| ----: | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
|     0 | Freeze new surfaces until a running session, a closed day and a sorted capture all survive navigation and a reload         | Stops adding rooms to a house that leaks    | —      |
|     1 | A running session must survive a moment switch, and must never write an outcome the person did not choose                  | Stops silent data corruption                | S-M    |
|     2 | Advance `capture_items.status` on sort/accept so triaged work stops resurrecting                                           | Stops the app un-doing the user's decisions | S      |
|     3 | Give "Close the day" a persisted, visible, once-per-day verdict                                                            | Makes the day's ending mean something       | S-M    |
|     4 | Either persist blockless sessions or refuse to start one — and surface the local-only banner the code already has          | Removes the invisible two-mode `Start now`  | M      |
|     5 | Fire the areas read on the post-sign-in path so a new account meets the ritual without refreshing                          | Makes the shipped onboarding actually ship  | S      |
|     6 | Fix the `suggestion_records` / `override_records` grants; make Health's all-clear conditional on its own reads succeeding  | Restores the truth surface                  | S-M    |
|     7 | Put the moment in the URL and in history                                                                                   | Makes Back mean what people expect          | M      |
|     8 | Add a timeout and a failure transition to the parse phase so the existing Sort failure UI can render                       | Removes the only hard hang found            | S      |
|     9 | Retire the proposals column into the hour rail; hide Google approval until Google is connected; one duration per task      | Ends the last planning duplication          | M      |
|    10 | Migrate `/calendar`, `/health`, `/areas` and Settings into the moments shell, then delete the cockpit presentation path    | Ends the three-shell split                  | L      |
|    11 | Copy pass: mobile hero, capture button chrome, empty return hook, duplicate CTAs, cleared-triage line, Start hero sentence | Cheap, and every one is felt daily          | S      |

## Acceptance bar before more feature work

Audit #1's bar, re-scored, plus what this audit adds.

|   # | Audit #1 acceptance criterion                                                                                  | Status                                                                                            |
| --: | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
|   1 | Back/Forward, refresh and direct URL entry always render the same screen                                       | **Partial** — entry yes; in-app moment switches are invisible to the URL, and Back skips them     |
|   2 | Health and Settings reachable in at most two interactions                                                      | **Pass**                                                                                          |
|   3 | Capture opens in one action, saves raw synchronously, keeps raw text plus return hook visible                  | **Pass**                                                                                          |
|   4 | Every pipeline badge represents unresolved/actionable work                                                     | **Partial** — the moments pipeline is honest; the cockpit rail is not                             |
|   5 | A task becomes a local block through one scheduling model in at most three intentional actions                 | **Pass** — select the task, click the hour; a real block is written and survives reload           |
|   6 | Mobile exposes the primary action in the first viewport and has zero overlapping controls                      | **Pass** on both; the hero copy still names a keyboard key                                        |
|   7 | All important touch targets are at least 44x44px                                                               | **Pass** on mobile (0 under 44 on every surface measured); two small desktop exceptions           |
|   8 | Focus shows task, area, first move, timing truth and definition of done                                        | **Pass**                                                                                          |
|   9 | "Closed" appears only after the review has actually persisted                                                  | **Fail** — "closed" never appears at all, and the day can be closed repeatedly                    |
|  10 | A seven-day real-use trial with no moment where you refresh to fix navigation or wonder whether work was saved | **Fail** — a new account must refresh to reach setup, and a moment switch silently ends a session |

New bar items this audit adds:

- A running focus session survives navigating anywhere in the app, and no outcome
  is ever recorded that the person did not choose.
- A completed session, a closed day and a sorted capture each survive a full page
  reload and are visible in the account.
- No surface reports "all good" while any of the reads behind it failed.
- Every long-running action has a timeout and a visible failure state.
- One task carries one duration everywhere it appears.

## Bottom line

Audit #1's instruction was: _make LifeOS feel like one calm, truthful instrument
from capture through closure._ Half of that is now done. It is calm; the language
is good; the accessibility, the mobile shell, the capture contract, the focus
screen and the planning model are all real work that landed.

What is left is narrower and more mechanical than what came before:

> Keep what the person gives you, never invent what they didn't, and show them
> you did.

Three of the four remaining P0s are plumbing — a status column that is never
advanced, a session that dies on a tab change, a verdict that is never rendered.
None of them needs a design decision. The product is closer to world-class than
its score suggests, and further from trustworthy than its polish suggests.

### Evidence and limitations

- Driven with Playwright Chromium against a local dev server built from
  `origin/main` @ `21b54267` in an isolated worktree (port 3611, listener PID
  verified against that worktree), with Supabase pointed at the already-running
  local stack. The stack was **not** reset — a concurrent lane was using it — so
  three fresh accounts were created through the auth admin API instead, each with
  zero rows in `areas`, `capture_items` and `tasks`.
- Surfaces driven: `/` at all three moments, the capture overlay, the triage and
  plan sheets, `/calendar`, `/health`, `/areas`, `/settings/areas`, `/login`, the
  onboarding ritual (all three steps), the command palette, the end-of-session
  sheet, and the signed-out home and signed-out triage — at 1440x1000 and
  390x844. Every state was screenshotted and its `innerText`, URL, console errors
  and failing network requests recorded; every screenshot was looked at.
- Truth checks were made by querying the database directly with the audited
  user's own JWT after each step, so "the copy says X" and "X actually happened"
  are separately evidenced. Two draft findings were withdrawn when the database
  contradicted them: placement does persist a real block (verified twice,
  including across a reload), and a session on a scheduled block saved correctly
  in the one clean run observed. Both are reported above in their corrected,
  narrower form. The clean save path was observed once; the two failure paths
  were each observed more than once, so no claim is made that saving a scheduled
  session always works.
- Target sizes and overlaps were measured with `getBoundingClientRect` filtered
  by `elementFromPoint` hit-testing, so collapsed disclosures and elements behind
  a modal do not produce false overlaps. Contrast was computed per text node
  against its painted background.
- **UNVERIFIED / not reached**: demo mode proper (audit #1 ran with Supabase
  unconfigured, `client === null`; this audit ran configured, so the demo banner
  and its copy contradictions were not re-tested — the signed-out local-only path
  was); a connected Google Calendar; real OpenAI parsing (the local stack has no
  key, so the mock parser served every sort); production-build performance;
  installed-PWA and offline behaviour; screen-reader use by a human; the area
  charter, operator profile and data-export panels inside Settings; the
  `/?sheet=plan` `Open full view →` link, which did not navigate when clicked;
  and the `Log win` / `Approve rollup` actions on the Close moment.
- **Excluded as dev-server artifacts, not product defects**: first-hit route
  compilation (80s on the first `/`), `main-app.js` `ERR_ABORTED` during
  hydration races, the Next.js dev indicator and its "1 Issue" button, and a
  hydration race that could wipe text typed into the login form before React
  attached. The hydration _mismatch_ error is kept as a finding because the
  divergence is in the source.
- Drive window 2026-07-25 21:14–23:35 local time. Time of day matters: the Close
  moment is auto-selected in the evening, which is why a brand-new account's very
  first screen was an end-of-day summary.
