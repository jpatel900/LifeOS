import { z } from "zod";

// #743 P0: PostgREST serializes `timestamptz` columns with a numeric offset
// ("+00:00"), not a "Z" suffix. Plain `z.string().datetime()` only accepts
// "Z", so every real row read through this schema 503'd in production (the
// OAuth callback died on this same read before the token exchange ever ran).
// `{ offset: true }` accepts both "Z" and numeric-offset suffixes, so a value
// written locally with `Date.prototype.toISOString()` (always "Z") and a
// value read back from PostgREST (offset) both parse. See
// `server.test.ts`'s "(#743 P0)" test for the verbatim production row this
// must accept.
//
// #858: this same gap existed at ~35 other row-schema call sites across the
// schemas package (entities.ts, meta-learning.ts, parse-capture.ts) that were
// still using bare `z.string().datetime()`. This helper is the single shared
// source of truth so no call site can drift back to the Z-only variant.
export const offsetDatetime = () => z.string().datetime({ offset: true });
