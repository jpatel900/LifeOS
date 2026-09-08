import "@testing-library/jest-dom/vitest";

// #687 demo-seed (owner 2026-08-30): the unconfigured-Supabase fallback now
// seeds its initial workflow state with sample data (`lib/flags.ts`'s
// `isDemoSeedEnabled`) so a fresh-eyes judge in demo mode sees a populated
// app instead of an empty shell. Off by default for the whole suite — the
// existing test population renders a fresh `WorkflowProvider` and asserts on
// the empty initial state (measured: flipping the default on broke 23 test
// files). Tests that specifically cover the seeded state opt back in with
// `process.env.NEXT_PUBLIC_DEMO_SEED = "true"` inside their own
// beforeEach/afterAll, the same per-test-file override idiom
// `routeSmoke.test.tsx` already uses for `NEXT_PUBLIC_MOMENTS_HOME`.
process.env.NEXT_PUBLIC_DEMO_SEED = "false";
