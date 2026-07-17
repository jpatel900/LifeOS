# ADR-0006: Multi-client doctrine — one authoritative domain layer, many thin clients

**Date:** 2026-07-16 | **Status:** accepted (owner decision 2026-07-16)

**Context:** LifeOS shipped as one deployable Next.js app whose server logic lives in Route Handlers and Server Actions (ADR 0001), with capture persistence and workflow reads executed client-side through the Supabase JS client under RLS. Agents (Claude, Codex, Hermes, scripts, CI) increasingly need headless access to the same system, and reimplementing LifeOS rules inside each agent — or letting agents write to the database directly — would fork the business logic and bypass the invariants. Separately, several authority documents phrased "one deployable Next.js app" and "no in-app multi-agent runtime" in ways that read as permanent architecture, when the single-app constraint was a V1 scoping decision and the multi-agent ban sits in the V1 non-goals list, not the permanent graveyard.

**Decision:** LifeOS has ONE authoritative domain and security layer and may have MULTIPLE clients.

- The authoritative layer is the existing server surface: Next.js Route Handlers / Server Actions in `apps/web`, the shared data-layer functions they call, Supabase Auth + Postgres + RLS, and the `@lifeos/schemas` contracts. This slice adds versioned client contracts under `/api/v1/*`; the deployable remains one Next.js app (ADR 0001 stands — this ADR widens who may CALL the surface, not where server logic lives).
- The web app remains the primary human interface.
- Headless clients (starting with the `@lifeos/cli` package) consume the versioned contracts over HTTP with a user-scoped bearer token verified by `requireSupabaseServerUser` before any work. Clients use Supabase directly for AUTH ONLY (obtaining/refreshing a user session); every data read and write goes through the server contracts.
- No client may independently reimplement LifeOS business rules, write directly to the database, or hold service-role credentials. Authentication, RLS, schema validation, approval gates, privacy rules, audit behavior, and external-write boundaries apply identically to every client.
- New clients and any agent autonomy remain issue-gated and trust-gated (ADR 0002 trust ladder; ADR 0005 capability classes). An in-app multi-agent runtime is possible future scope — no longer phrased as a flat ban — but requires its own owner-ratified ADR + issue before any work.

**Rationale:** The invariants live in one place today because there is one client. The moment a second consumer exists, either the invariants move behind a contract every client shares, or they silently fork. Thin versioned routes over the existing data-layer functions add near-zero surface (the bearer seam already exists in `/api/export` and `google-calendar/*`) while making raw-save-first, RLS scoping, and schema validation structurally unavoidable for every future client.

**Alternatives rejected:** CLI talks to Supabase tables directly under RLS — rejected by owner decision (clients must not write directly to the database) and because client-side invariants like raw-save-first would need reimplementing per client. A separate general-purpose backend — rejected as unjustified surface; the Next.js server layer already exists and stays the single deployable. Provider-specific agent wrappers (MCP/ACP/Claude-specific) — rejected for this slice; the CLI is provider-neutral JSON-on-stdout that any agent can call.

**Consequences:** Capture persistence and reads gain server routes that the web client MAY migrate to later (not required by this ADR). Every `/api/v1` route is a stable contract: breaking changes require a new version path, and the capabilities endpoint advertises what a deployment supports so agents can feature-detect. The stale phrasings in ARCHITECTURE.md, REQUIREMENTS.md NFR-002/§4, AGENTS.md §4, and PROJECT_STATE.md are updated to cite this ADR.

**Reversal trigger:** Revisit if the versioned contract surface grows faster than client value (one-in-one-out pressure, NS-INV-8), or if headless access produces trust/audit incidents the bearer seam cannot attribute.
