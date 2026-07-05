import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const repoRoot = resolve(__dirname, "../../../..");

type CoherenceRegistry = {
  features: Array<{
    fr: string;
    surfaces?: string[];
    invariants?: string[];
    policy_ids?: string[];
    interacts_with?: Array<{
      fr: string;
      kind: string;
      resolution_ref?: string;
    }>;
  }>;
  policies: Array<{ id: string }>;
};

function readRegistry(): CoherenceRegistry {
  return JSON.parse(
    readFileSync(resolve(repoRoot, "docs/coherence-registry.json"), "utf8"),
  ) as CoherenceRegistry;
}

function findDuplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

function readRequirementFrHeadings(): string[] {
  const requirements = readFileSync(
    resolve(repoRoot, "docs/REQUIREMENTS.md"),
    "utf8",
  );

  return [...requirements.matchAll(/^### (FR-\d{3})\b/gm)].map(
    (match) => match[1],
  );
}

function readAdrPaths(): string[] {
  const adrDirectory = resolve(repoRoot, "docs/adr");

  return readdirSync(adrDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `docs/adr/${entry.name}`)
    .sort();
}

function readKnownInvariantIds(): Set<string> {
  const invariantSourcePaths = [
    "docs/ENGINEERING_INVARIANTS.md",
    ...readAdrPaths(),
  ];
  const sourceText = invariantSourcePaths
    .map((path) => readFileSync(resolve(repoRoot, path), "utf8"))
    .join("\n");

  return new Set(
    [...sourceText.matchAll(/\b(?:INV|NS-INV|UX-INV)-[A-Za-z0-9-]+\b/g)].map(
      (match) => match[0],
    ),
  );
}

describe("coherence registry", () => {
  it("G-FUNC-1 — FR referential integrity.", () => {
    const registry = readRegistry();
    const requirementFrHeadings = readRequirementFrHeadings();
    const duplicateRequirementFrHeadings = findDuplicateValues(
      requirementFrHeadings,
    );
    const registeredFeatureFrs = registry.features.map((feature) => feature.fr);
    const duplicateRegisteredFeatureFrs =
      findDuplicateValues(registeredFeatureFrs);
    const uniqueRequirementFrHeadings = new Set(requirementFrHeadings);
    const unknownFeatureFrs = registeredFeatureFrs.filter(
      (fr) => !uniqueRequirementFrHeadings.has(fr),
    );
    const unknownInteractionFrs = registry.features.flatMap((feature) =>
      (feature.interacts_with ?? [])
        .map((edge) => edge.fr)
        .filter((fr) => !uniqueRequirementFrHeadings.has(fr))
        .map((fr) => `${feature.fr} -> ${fr}`),
    );

    expect(
      duplicateRequirementFrHeadings,
      `Duplicate FR headings in docs/REQUIREMENTS.md: ${duplicateRequirementFrHeadings.join(", ")}`,
    ).toEqual([]);
    expect(
      duplicateRegisteredFeatureFrs,
      `Duplicate feature fr values in docs/coherence-registry.json: ${duplicateRegisteredFeatureFrs.join(", ")}`,
    ).toEqual([]);
    expect(
      unknownFeatureFrs,
      `Registry feature fr values without matching ### FR-NNN headings: ${unknownFeatureFrs.join(", ")}`,
    ).toEqual([]);
    expect(
      unknownInteractionFrs,
      `Registry interacts_with fr values without matching ### FR-NNN headings: ${unknownInteractionFrs.join(", ")}`,
    ).toEqual([]);
  });

  it("G-FUNC-2 — Policy-id registration (registry-internal half only).", () => {
    const registry = readRegistry();
    const registeredPolicyIds = new Set(
      registry.policies.map((policy) => policy.id),
    );
    const unknownPolicyRefs = registry.features.flatMap((feature) =>
      (feature.policy_ids ?? [])
        .filter((policyId) => !registeredPolicyIds.has(policyId))
        .map((policyId) => `${feature.fr}: ${policyId}`),
    );

    expect(
      unknownPolicyRefs,
      `Registry policy_ids references without matching policies[] ids: ${unknownPolicyRefs.join(", ")}`,
    ).toEqual([]);
  });

  it("G-FUNC-3 — Invariant-id validity.", () => {
    const registry = readRegistry();
    const knownInvariantIds = readKnownInvariantIds();
    const unknownInvariantRefs = registry.features.flatMap((feature) =>
      (feature.invariants ?? [])
        .filter((invariantId) => !knownInvariantIds.has(invariantId))
        .map((invariantId) => `${feature.fr}: ${invariantId}`),
    );

    expect(
      unknownInvariantRefs,
      `Registry invariants references without matching invariant ids: ${unknownInvariantRefs.join(", ")}`,
    ).toEqual([]);
  });

  it("G-FUNC-4 — No unresolved conflict.", () => {
    const registry = readRegistry();
    const unresolvedConflicts = registry.features.flatMap((feature) =>
      (feature.interacts_with ?? [])
        .filter(
          (edge) =>
            edge.kind === "X" && (edge.resolution_ref ?? "").trim() === "",
        )
        .map((edge) => `${feature.fr} -> ${edge.fr}`),
    );

    expect(
      unresolvedConflicts,
      `Registry kind:"X" edges without non-empty resolution_ref: ${unresolvedConflicts.join(", ")}`,
    ).toEqual([]);
  });

  it("G-FUNC-5 — Surface freshness (soft).", () => {
    const registry = readRegistry();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missingPathSurfaces = registry.features.flatMap((feature) =>
      (feature.surfaces ?? [])
        .filter((surface) => surface.includes("/"))
        .filter((surface) => !existsSync(resolve(repoRoot, surface)))
        .map((surface) => `${feature.fr}: ${surface}`),
    );
    const logicalSurfaces = registry.features.flatMap((feature) =>
      (feature.surfaces ?? [])
        .filter((surface) => !surface.includes("/"))
        .map((surface) => `${feature.fr}: ${surface}`),
    );

    for (const surface of logicalSurfaces) {
      console.warn(
        `Logical coherence surface is not path-checked by G-FUNC-5: ${surface}`,
      );
    }

    expect(warnSpy).toHaveBeenCalledTimes(logicalSurfaces.length);
    warnSpy.mockRestore();
    expect(
      missingPathSurfaces,
      `Registry surfaces[] path entries that do not exist: ${missingPathSurfaces.join(", ")}`,
    ).toEqual([]);
  });
});
