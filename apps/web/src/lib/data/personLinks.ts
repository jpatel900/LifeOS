import type { ParseCapturePersonMention, Person } from "@lifeos/schemas";

/**
 * Person-link resolution for Stage 1 slice S3 (issue #255).
 *
 * A parse-capture `person_mention` is only a PROPOSAL. This module resolves a
 * mention against the user's existing `people` rows by normalized name, or
 * marks it as a new-person proposal. Nothing here writes: persistence is gated
 * on explicit user approval in triage (NS-INV-4). An unmatched or rejected
 * mention degrades to a plain task, and the raw capture is never lost.
 */

/**
 * Canonical name normalization used for matching, mirroring the DATA_MODEL 4.10
 * `people.normalized_name` contract ("lowercased, for matching"). Trims,
 * lowercases, and collapses internal whitespace so "  Sarah   Lee " and
 * "sarah lee" resolve to the same key.
 */
export function normalizePersonName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type PersonLinkResolution =
  | {
      kind: "matched";
      mention: ParseCapturePersonMention;
      normalizedName: string;
      person: Person;
    }
  | {
      kind: "new";
      mention: ParseCapturePersonMention;
      normalizedName: string;
    };

/**
 * Resolve a single mention against the candidate people. A blank name resolves
 * to a new-person proposal with an empty key (the caller decides whether to
 * surface it). Matching is exact on the normalized key — fuzzy matching is
 * deliberately out of scope so an ambiguous name never silently links to the
 * wrong person.
 */
export function resolvePersonMention(
  mention: ParseCapturePersonMention,
  people: readonly Person[],
): PersonLinkResolution {
  const normalizedName = normalizePersonName(mention.name);
  const person = people.find(
    (candidate) =>
      candidate.archived_at === null &&
      normalizePersonName(candidate.normalized_name) === normalizedName,
  );

  if (person) {
    return { kind: "matched", mention, normalizedName, person };
  }

  return { kind: "new", mention, normalizedName };
}

/**
 * Resolve every mention on a draft. Returns one resolution per mention,
 * preserving order. An empty mention list yields an empty result — the
 * "no person, plain task" path.
 */
export function resolvePersonMentions(
  mentions: readonly ParseCapturePersonMention[],
  people: readonly Person[],
): PersonLinkResolution[] {
  return mentions.map((mention) => resolvePersonMention(mention, people));
}
