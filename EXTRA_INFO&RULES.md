

|Layer|Recommendation|
|-|-|
|**Frontend**|Next.js + TypeScript + Tailwind + shadcn/ui|
|**Backend**|Next.js API routes/server actions first|
|**Database**|Supabase Postgres|
|**Auth**|Supabase Auth or Clerk|
|**Payments**|Stripe only when needed|
|**Hosting**|Vercel|
|**Email**|Resend|
|**File storage**|Supabase Storage or Cloudflare R2|
|**Testing**|Vitest + Playwright|
|**Analytics**|PostHog or Plausible|
|**Error tracking**|Sentry|
|**AI observability later**|Langfuse or Helicone|



|Governance rule|Practical implementation|
|-|-|
|**Agents never work directly on main** 🚫|Always use branches. Main branch requires passing tests.|
|**No secrets in prompts** 🔐|Use `.env.local`; never paste API keys into chat.|
|**No production database writes by agents** 💀|Agents get dev/staging credentials only.|
|**All generated code gets reviewed** 👀|Human review + one separate AI review.|
|**All meaningful features need tests** 🧪|“No test, no merge” for core logic.|
|**MCP tools are least-privilege** 🔌|Read-only first. Add write permissions only when needed.|
|**Filesystem access is scoped** 📁|Agent only sees the project folder, not the whole computer.|
|**Network access is restricted** 🌐|Allow only required package registries/docs/APIs.|
|**Every agent task has acceptance criteria** ✅|No vague “make it better” prompts for coding.|
|**Every major change has rollback** ↩️|Git commits, tagged releases, database migrations reversible where possible.|



