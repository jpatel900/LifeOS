# 2026-07-01 Production Supabase Connectivity Check

Status: diagnostic documentation only; no code, secrets, or environment variables changed.

## Trigger

Health showed a connection/session failure:

- `Health checks could not load`
- `Health checks are taking too long. Verify your connection or session, then run the check again.`

Earlier investigation found the deployed app pointing at `https://vpjmltajbaqxwunjjgtq.supabase.co` while that hostname returned `NXDOMAIN`. That made Supabase-backed surfaces likely to hang or fail before app-level Health checks could report specific provider status.

## Current Evidence

Read-only production probes on 2026-07-01 showed:

- `https://life-os-web-azure.vercel.app/health` returned HTTP 200.
- The deployed JavaScript bundle still bakes `NEXT_PUBLIC_SUPABASE_URL=https://vpjmltajbaqxwunjjgtq.supabase.co`.
- The public Supabase key in the deployed bundle has the `sb_publishable_*` shape; the key value is intentionally not recorded here.
- `GET /auth/v1/health` against the deployed Supabase project returned HTTP 200.
- `GET /rest/v1/areas?select=id&limit=1` with the deployed public key returned HTTP 200 and `[]`.

## Interpretation

The earlier public connectivity failure is no longer active at the DNS, Auth health, or REST layer. The most likely explanation is external/environment recovery or correction after the original check, not an app-code repair in this run.

This does not close issue `#93`: no authenticated human browser session against the protected Vercel deployment was verified. It also does not resolve the Health/product gap tracked in `docs/KNOWN_ISSUES.md` #3: provider degradation should eventually surface as a specific Health/account-sync incident instead of a generic timeout.

## Follow-Up

- Keep issue `#93` open until an authenticated production smoke is run.
- If Health reports the same timeout again, re-check the same layers in order: Vercel app 200, deployed Supabase URL in the bundle, Supabase DNS, `/auth/v1/health`, and REST with the deployed public key.
- Do not treat local Supabase success as production proof.
