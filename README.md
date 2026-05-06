# LifeOS

## Documentation authority order

Authority decreases down the list. higher entries **override** lower ones when they conflict.

1. **AGENTS.md** — Agent operating rules; highest authority for Cursor/Codex behavior.
2. **REQUIREMENTS.md** — Product requirements and V1 scope.
3. **ARCHITECTURE.md** — Technical architecture and boundaries.
4. **DATA_MODEL.md** — Canonical domain and data model.
5. **UX_FLOWS.md** — User journeys and screen behavior.
6. **SECURITY_PRIVACY.md** — Security, privacy, auth, and external-write rules.
7. **TEST_PLAN.md** — Acceptance tests and validation requirements.
8. **PROJECT_BRIEF.md** — Product context and thesis.

**Architecture Decision Records (ADRs)** in `docs/adr/` **clarify or amend ARCHITECTURE.md** for the decisions they record. If an ADR conflicts with informal notes elsewhere, **trust the ADR + ARCHITECTURE.md + this table**.

### Background / non-authoritative

- **LIFE_OS_WIKI.md** and **EXTRA_INFO_AND_RULES.md** — Ideas, governance reminders, and historical notes. **Not** implementation authority. Do not override the numbered docs above.

### V1 primary workflow screens vs Settings

To align **NFR-005** (six primary screens) with navigation that includes configuration: the **six primary workflow screens** are **Capture**, **Triage**, **Calendar / Planning**, **Execute**, **Review**, and **Health**. **Settings** (areas, policies, integrations) is **secondary / admin** — it supports the product but is **not** counted toward the six-primary limit.

### Server boundary (V1)

V1 application server logic uses **Next.js Route Handlers and Server Actions**. **Supabase Edge Functions** are **not** the default for core APIs in V1 (use **V1.5+** or documented exceptions for cron / specific integrations). Details: **`docs/adr/0001-v1-server-boundary.md`**.
