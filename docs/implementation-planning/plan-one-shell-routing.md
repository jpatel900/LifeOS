STATUS: DESIGN NOTE for epic #555 item 1 — ratified by the owner's standing continuous-loop order + the 2026-07-13 audit acceptance bar; implementation slices may start once this merges.

# One shell, one renderer per URL — routing unification

Binding source: `docs/design/ux-audit-2026-07-13-codex.md` (P0 "two products sharing one URL space"), epic #555, acceptance bar items "Back/Forward, refresh, and direct URL entry always render the same screen" and "Health and Settings are reachable in at most two interactions."

## Diagnosis (verified against code, 2026-07-13)

- Every stage route exists as a real Next.js page (`app/{capture,triage,calendar,execute,review,health,areas}/page.tsx`) rendering `<CockpitRoute stage="…"/>` → `LifeOSCockpit` with `initialStage`.
- Inside the cockpit, `navigate()` does `setStage(next)` + **raw `window.history.pushState`** (LifeOSCockpit.tsx:227). No `popstate` listener exists.
- Consequences, exactly as audited: Back/Forward change the URL but never the React state; the URL and the rendered stage diverge; `/` reached via pushState renders the cockpit while a refresh of the same URL renders the moments home; the moments home "View area health" CTA is a dead affordance.

## Principle

**The URL is the only source of navigation truth.** No component owns a `stage` state that can disagree with the pathname. One renderer per URL, always, regardless of arrival path.

## Design

1. **Kill `pushState`; navigate with the app router.** `navigate(nextStage)` becomes `router.push(STAGE_PATHS[nextStage])` (`next/navigation`). Client-side navigation preserves in-memory context; demo state additionally survives remounts via the existing sessionStorage persistence (proven by the e2e drives).
2. **Derive stage from the pathname.** `LifeOSCockpit` drops `useState(initialStage)` in favor of `stage = STAGE_FOR_PATH[usePathname()] ?? initialStage`. The `initialStage` prop remains only as the SSR/first-paint hint from each page. Back/Forward then work with zero extra code — the router re-renders, the pathname changes, the stage follows.
3. **`/` belongs to the moments home, unconditionally.** The cockpit's logo/home affordance becomes a real `router.push("/")`. The cockpit-today grid stays reachable at its own explicit path (`/today`, a new one-line page.tsx) until the stage-by-stage moments migration (audit's long arc) retires it — no silent dual ownership of `/`.
4. **Kill the fake CTA.** Moments home "View area health →" becomes a real link to `/health`. Settings link (`/settings/areas`) joins the home chrome so Health + Settings are ≤2 interactions from `/`.
5. **localStorage stage preference** (`lifeos.cockpit.preferences.stage`) stops driving render on load (the URL already says where we are); it may still be written for the explicit "resume where I was" affordance on `/today` only.

## Non-goals (this slice)

- No moments-shell migration of cockpit stages (that is the epic's long arc, item 4+).
- No visual redesign of any surface (polish freeze holds).
- No change to WorkflowContext state semantics.

## Oracle

New e2e spec `nav-truth.spec.ts`: for each route (`/`, `/capture`, `/calendar`, `/execute`, `/review`, `/health`, `/today`): direct entry renders its screen (assert a per-screen landmark); in-app navigate → Back → assert BOTH the URL and the landmark of the previous screen; refresh → same screen; `/` after cockpit round-trip renders the moments home. This spec is the acceptance-bar item made permanent.

## Effort and sequencing

S-M, one slice (mechanical swap + link fixes + spec). File-disjoint from #551/#553/#556/#558/#559 except `LifeOSCockpit.tsx` — must land BEFORE #551's hero work only if #551 touches the cockpit (it does not; it touches TodayMoments) and AFTER #553 (also touches TodayMoments? no — #553 touches the pill component). Coordinate on LifeOSCockpit.tsx: nothing else in flight touches it.
