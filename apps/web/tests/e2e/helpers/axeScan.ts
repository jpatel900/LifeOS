import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * Final UX Loop C5 — shared axe-core driver for the accessibility pin
 * (a11y-axe-pin.spec.ts).
 *
 * Tag-restricted to WCAG 2.0/2.1 A and AA (`wcag2a`, `wcag2aa`, `wcag21a`,
 * `wcag21aa`) on purpose: axe-core's default rule set also ships
 * `best-practice` rules (e.g. `region`, `landmark-one-main`,
 * `page-has-heading-one`) that are not part of AA conformance. Running the
 * default set would pin best-practice opinions alongside real AA failures
 * and make the ratchet noisy; docs/design/ux-audit-2026-07-26-fable.md's own
 * accessibility pass ("Contrast is effectively at AA... zero unnamed buttons
 * or links and zero unlabeled inputs") is itself an AA-scoped claim, so this
 * pin stays scoped to match it.
 */
export async function scanAxeViolationNodes(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  // Flattened to one entry per offending NODE, not per rule — the same
  // choice hit-target-overlap-pin.spec.ts makes for the same reason: a rule
  // going from 2 offending nodes to 4 must move the ratchet even though the
  // rule ID is unchanged, and a completely different new rule firing on a
  // surface that already had one violation must add to the count rather
  // than being masked by "there was already 1 violation here".
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      rule: violation.id,
      impact: violation.impact ?? "unknown",
      target: node.target.join(" "),
      summary: node.failureSummary ?? violation.help,
    })),
  );
}
