/**
 * NFR-006 (#692, ratified in #696) half 1 — implementation vocabulary that must
 * never reach a user-facing surface.
 *
 * This list is the SINGLE source of truth for both plain-language guards:
 *   - `healthPage.test.tsx` renders the health screen and asserts against the
 *     real DOM (screen-scoped, added in #724).
 *   - `plainLanguageGuard.test.ts` walks source text repo-wide (this module).
 *
 * Adding a term here tightens both guards at once. That is deliberate: the
 * #692 inventory asks later slices to extend the banned list as they widen the
 * doctrine (e.g. the Mirror gauge vocabulary), and a single list means the
 * screen-scoped guard can never drift behind the repo-wide one.
 */
export const BANNED_ON_USER_SURFACE: readonly RegExp[] = [
  // vendors and infrastructure
  /supabase/i,
  /sentry/i,
  /posthog/i,
  /langfuse/i,
  /observability/i,
  /telemetry/i,
  /autocapture/i,
  /\bRLS\b/,
  /\bDSN\b/,
  /anon key/i,
  /\bOAuth\b/i,
  /\bserver\b/i,
  /\btokens?\b/i,
  // schema and internal identifiers
  /capture_items/i,
  /subsystem/i,
  /persistence/i,
  /schema validation/i,
  // implementation modes and mechanics
  /\bmock\b/i,
  /deterministic/i,
  /local-only/i,
  /encryption key/i,
  /auth helpers/i,
  /env vars/i,
  /environment variables/i,
  /connection metadata/i,
  /browser storage/i,
  /\bRPCs?\b/,
  /\bprovider\b/i,
  /\bsync\b/i,
];

/**
 * Terms the #692 inventory names as jargon that are DELIBERATELY not banned
 * here, with the reason. Recorded so a later slice does not assume an
 * oversight:
 *
 * - `session`: LifeOS has a first-class user-facing "execution session", so a
 *   blanket ban would flag correct domain copy as a violation. The infra sense
 *   ("Supabase session", "browser session") is already caught by neighbouring
 *   terms in every inventory example.
 */
