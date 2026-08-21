import { describe, expect, it } from "vitest";
import { metadata } from "./layout";

// #687 (round-6 fresh-eyes judge, finding: tab title) — pins the fix so the
// retired shell's name cannot silently return. "Workflow Cockpit" was the
// seven-stage cockpit shell's own name (ADR 0003 replaced it with the moments
// home); the base <title> every surface inherits (home, every sheet, /login,
// /settings/areas, and the 404 — none of them set their own metadata) must
// never contain it again.
describe("root layout metadata (#687 round-6 tab title)", () => {
  it("titles the tab plainly as LifeOS, not the retired shell name", () => {
    expect(metadata.title).toBe("LifeOS");
  });

  it("never reintroduces the retired 'Cockpit' shell name in the title", () => {
    expect(String(metadata.title)).not.toMatch(/cockpit/i);
  });
});
