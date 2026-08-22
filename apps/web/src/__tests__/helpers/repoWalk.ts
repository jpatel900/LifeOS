import { readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { expect } from "vitest";

/**
 * Shared directory-listing cache for the repo-walking guard tests (issue
 * #761). Several guards (`sourceOfTruth`, `engineeringInvariants`,
 * `coherenceRegistry`, `contextAssemblyChokePoint`,
 * `firstTinyStepIdentityGuard`, `docRegistry`, `publicEvidenceHygiene`,
 * `motion`, `plainLanguageGuard`) each define their own small recursive
 * `walk*Files` helper, and several of them call that helper more than once
 * per file over the same or a nested/overlapping root (e.g.
 * `sourceOfTruth.test.ts` walks `apps/web/src/__tests__`, then
 * `apps/web/src`, then `apps/web` — three overlapping full recursive scans
 * in one file). Under local machine IO load that redundant re-reading of the
 * same directories was enough to blow past vitest's 5000ms default per-test
 * timeout, even though every guard passes when run alone with a cold cache.
 *
 * `readDirCached` is a drop-in replacement for
 * `readdirSync(path, { withFileTypes: true })` that every guard's walk
 * function calls instead of `readdirSync` directly. It changes nothing about
 * what gets scanned or how each guard filters/ignores entries — every guard
 * keeps its own ignore-directory set and filtering logic exactly as before,
 * since those differ intentionally per guard (e.g. `docRegistry` ignores
 * `.git`, `plainLanguageGuard` ignores `__tests__`/`testing` instead). This
 * cache only removes the redundant syscalls: each absolute directory is read
 * off disk once per test-file run (vitest's default `threads` pool isolates
 * modules per test file, so the cache's lifetime is "for the duration of one
 * guard file", which is exactly where the observed redundant re-walks live).
 */
const direntCache = new Map<string, Dirent[]>();

export function readDirCached(absolutePath: string): Dirent[] {
  const cached = direntCache.get(absolutePath);
  if (cached) {
    // Defensive copy: at least one caller (plainLanguageScan.ts) sorts its
    // result in place. Handing back the cached array directly would let that
    // mutate the shared cache for every other reader of this path.
    return [...cached];
  }

  const entries = readdirSync(absolutePath, { withFileTypes: true });
  direntCache.set(absolutePath, entries);
  return [...entries];
}

/**
 * Anti-vacuum floor, shared by the repo-walking guard tests in this
 * directory (the repoWalk vacuous-pass audit that followed PR #932, which
 * fixed this exact hole in check-migration-collision.mjs and
 * check-turbo-test-inputs.mjs but flagged these nine vitest guards as a
 * separate pass). Every one of these guards walks part of the repo and then
 * asserts "none of what I found violates X" -- an assertion that is
 * trivially true of an empty (or unexpectedly small) result. A renamed
 * directory, a widened ignore list, or a glob/filter that stopped matching
 * would make the guard pass while blind to everything it was meant to scan.
 *
 * Call this right after building a file list, before using it in any other
 * assertion -- same shape as check-turbo-test-inputs.mjs's
 * `assert.ok(requiredSegments.size >= 2, ...)` and
 * check-migration-collision.mjs's `assertBaseFilesNonEmpty()`, reused here
 * instead of inventing a third shape. `minimum` should sit well under the
 * walk's real current count (see each call site's comment) so it only trips
 * on a genuine collapse, never on ordinary repo growth or shrinkage.
 */
export function assertWalkFoundFiles(
  files: readonly unknown[],
  description: string,
  minimum = 1,
): void {
  expect(
    files.length,
    `${description}: found ${files.length} file(s) from this repo walk, expected at least ${minimum}. A walk that silently returns too few files makes every "none of what I found violates X" assertion built on it pass vacuously -- check the root path, the ignore list, and any filename filter for a stale assumption before trusting this result.`,
  ).toBeGreaterThanOrEqual(minimum);
}
