# Smoke Verification Results

- Task name: Local Supabase and production smoke verification closeout
- Branch: `verification/smoke-and-calendar-closeout`

## Original scope

Close the verification-only issues for local Supabase workflow smoke and production/Vercel smoke with exact evidence, no runtime changes, and no weakened deployment or provider protections.

## Assumptions

- Verification issues may close with explicit pass/fail/skipped evidence when the blocker is environmental or access-boundary related.
- Any verification blocker that deserves implementation work should become a separate scoped issue.

## Decisions

- Treat the local Supabase failure as an environment blocker, not a repo-runtime defect.
- Do not weaken Vercel deployment protection to satisfy production smoke from this environment.
- Record exact skipped surfaces instead of implying broader verification.

## Deviations

- Local browser smoke and opt-in local RLS tests were not run because the local Supabase stack could not be reset/seeded reliably after the port bind failure on `54322`.
- Authenticated production route checks were not run because this environment only reached the protected deployment shell and no approved bypass or authenticated session was provided.

## Tradeoffs

- Closing the verification issues now keeps issue hygiene honest, but it does not claim full local or production acceptance proof.
- A separate blocker issue is required for the Windows local-port exclusion so future verification work is not hidden inside the old smoke issue.

## Files changed and why

- `docs/implementation-notes/2026-05-27-smoke-verification-results.md`: durable verification evidence and boundaries.
- `docs/PROJECT_STATE.md`: current status, known blocker, and next-step guidance.

## Validation commands and results

- `supabase status -o env`: failed before Docker start because the Docker named pipe was unavailable.
- `Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' ...; docker info --format '{{.ServerVersion}}'`: passed, Docker server reachable (`28.3.2`).
- `.env.local` check: not present at repo root or `apps/web/.env.local`.
- `supabase start`: passed once and reported local services on `127.0.0.1:54321`, `54322`, `54323`, and `54324`.
- `supabase db reset`: failed with `listen tcp 0.0.0.0:54322: bind: An attempt was made to access a socket in a way forbidden by its access permissions.`
- `supabase stop`: passed.
- second `supabase start`: failed on the same `54322` bind.
- `netsh interface ipv4 show excludedportrange protocol=tcp`: showed excluded range `54318-54417`, which includes `54322`.
- Vercel deployment fetch for `/`: passed with `200 OK`.
- Vercel deployment fetch for `/login`: returned `401 Unauthorized` from Vercel Authentication / deployment protection.
- temporary Vercel bypass URL request: not used because that would weaken deployment protection without explicit approval.

## Risks

- Local Supabase verification remains blocked until the Windows excluded-port conflict is resolved or local Supabase ports are reconfigured safely.
- Production smoke evidence is only partial from this environment; authenticated route behavior remains unverified here.

## Deferred items

- Re-run local Supabase smoke and opt-in local RLS tests after resolving the `54322` port blocker.
- Re-run production smoke from an authenticated deployment session or an explicitly approved temporary bypass path.

## Rollback notes

- Docs-only change. Revert the note and `PROJECT_STATE` update if the verification record needs correction.
