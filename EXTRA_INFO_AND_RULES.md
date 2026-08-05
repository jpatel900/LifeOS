# EXTRA_INFO_AND_RULES.md

**Background reference only.** This file does not override **AGENTS.md** or any doc in README.md's documentation authority order (`docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and the rest of `docs/`). Use it for planning context only, not direct implementation scope. V1 is the shipped baseline, not a ceiling; see **`docs/adr/0005-staged-evolution-after-v1.md`** for evolution gates. For the server boundary (Next.js Route Handlers / Server Actions vs Supabase Edge Functions), see **`docs/adr/0001-v1-server-boundary.md`** and **ARCHITECTURE.md**.

---

| Layer                       | Recommendation (LifeOS)                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Frontend**                | Next.js + TypeScript (Tailwind / shadcn-style UI as adopted)                                                                         |
| **Backend (baseline)**      | **Next.js Route Handlers** — canonical for app server logic (Server Actions permitted by ADR 0001; none exist in the codebase today) |
| **Database**                | Supabase Postgres + migrations + RLS                                                                                                 |
| **Auth**                    | **Supabase Auth** (single source for this product)                                                                                   |
| **Payments**                | Out of approved scope; add only through reviewed requirements                                                                        |
| **Hosting**                 | Vercel (frontend + Next server)                                                                                                      |
| **Email**                   | Defer unless a feature requires it; prefer least vendors                                                                             |
| **File storage**            | Supabase Storage or similar only when needed                                                                                         |
| **Testing**                 | Vitest + Playwright as adopted                                                                                                       |
| **Analytics**               | Avoid extra services unless a reviewed requirement proves the value                                                                  |
| **Error tracking**          | Add when needed (e.g. Sentry)                                                                                                        |
| **AI observability**        | Optional; no hard dependency                                                                                                         |
| **Supabase Edge Functions** | Optional by default; use Next.js server code unless ADR exception (cron / integration)                                               |

---

| Governance rule                                | Practical implementation                                                                                                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agents never work directly on main**         | Use branches. Main branch requires passing tests.                                                                                                                                                           |
| **No secrets in prompts**                      | Use `.env.local`; never paste API keys into chat.                                                                                                                                                           |
| **No direct production data writes by agents** | Agents use dev/local credentials; prod DDL goes only through the gated `migration-apply.yml` workflow or owner-run runbooks.                                                                                |
| **Review is risk-routed**                      | Risky surfaces always get human review; the docs-only T0 lane may auto-merge after CI (see `.github/AGENT_AUTOMATION_POLICY.md`; blanket per-PR AI review was removed by PR #248 — see `docs/FAILURES.md`). |
| **All meaningful features need tests**         | “No test, no merge” for core logic.                                                                                                                                                                         |
| **MCP tools are least-privilege**              | Read-only first. Add write permissions only when needed.                                                                                                                                                    |
| **Filesystem access is scoped**                | Agent only sees the project folder, not the whole computer.                                                                                                                                                 |
| **Network access is restricted**               | Allow only required package registries/docs/APIs.                                                                                                                                                           |
| **Every agent task has acceptance criteria**   | No vague “make it better” prompts for coding.                                                                                                                                                               |
| **Every major change has rollback**            | Git commits, tagged releases, database migrations reversible where possible.                                                                                                                                |
