import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_CONTEXT_SURFACE_DECLARATIONS,
  buildParseCaptureMessages,
  buildRollupProseMessages,
  buildTaskMapDraftMessages,
  estimateAiContextTokens,
  type AiContextSurfaceId,
  type ParseCaptureMessage,
} from "./contextAssembly";

const FIXTURE_IDS = {
  parse: "parse.full-context.v1",
  rollup: "rollup.full-draft.v1",
  task_map_draft: "task-map.max-structural-shape.v1",
} as const satisfies Record<AiContextSurfaceId, string>;

const BUILDERS = {
  parse: () =>
    buildParseCaptureMessages({
      rawText:
        "Prepare the quarterly review, confirm the delivery risks with each accountable owner, reconcile the open decisions against the release criteria, and send Morgan a concise decision brief before Friday's review.",
      areaContext: [
        {
          slug: "main-job",
          name: "Main Job",
          charterText: "Ship reliable work while protecting focused mornings.",
        },
        {
          slug: "personal",
          name: "Personal",
          charterText: "Keep commitments realistic and leave recovery margin.",
        },
      ],
      operatorProfile: {
        profileText:
          "Strong at synthesis and risk framing; reduce starting friction and avoid turning a decision brief into an exhaustive report.",
        compensationRules: [
          { trait: "starting friction", rule: "name one physical first move" },
          {
            trait: "scope expansion",
            rule: "separate decision-critical evidence from optional detail",
          },
        ],
      },
      rollupContext: [
        {
          areaSlug: "main-job",
          periodType: "week",
          periodLabel: "2026-W28",
          highlights: [
            "Closed the release checklist",
            "Confirmed owners for the migration sequence",
          ],
          misses: [
            "Deferred the risk review",
            "Left two assumptions without explicit validation owners",
          ],
        },
      ],
    }),
  rollup: () =>
    buildRollupProseMessages({
      areaLabel: "Main Job",
      periodType: "week",
      periodLabel: "2026-W28",
      highlights: [
        "Closed the release checklist with every owner confirmed and the final evidence links attached for review.",
        "Protected two focused work blocks for the migration plan.",
      ],
      misses: [
        "Deferred the risk review after the input deadline moved, leaving the decision brief without a final recommendation.",
        "Left one follow-up without an explicit next action.",
      ],
      counts: { completed_tasks: 7, missed_blocks: 1, open_follow_ups: 1 },
    }),
  task_map_draft: () =>
    buildTaskMapDraftMessages({
      title: "Publish the migration readiness brief",
      description:
        "Combine the technical findings, unresolved risks, and accountable owners into one reviewable brief.",
      definitionOfDone:
        "The brief is approved by the migration lead and every blocking risk has an owner.",
      firstTinyStep:
        "Open the readiness template and paste in the current risk list.",
      breakdownSteps: [
        { title: "Collect current findings", estimatedMinutes: 25 },
        { title: "Confirm owners for blocking risks", estimatedMinutes: 20 },
        { title: "Draft the readiness recommendation", estimatedMinutes: 35 },
        {
          title: "Reconcile evidence against release criteria",
          estimatedMinutes: 30,
        },
        {
          title: "Review the recommendation with the migration lead",
          estimatedMinutes: 25,
        },
        { title: "Publish the approved brief", estimatedMinutes: 10 },
        {
          title: "Record the approved decision and follow-ups",
          estimatedMinutes: 15,
        },
      ],
      currentMap: {
        nodes: [
          {
            id: "collect-findings",
            title: "Collect current findings",
            role: "required",
            done: true,
          },
          {
            id: "confirm-owners",
            title: "Confirm owners for blocking risks",
            role: "required",
          },
          {
            id: "reconcile-evidence",
            title: "Reconcile evidence against release criteria",
            role: "required",
          },
          {
            id: "draft-recommendation",
            title: "Draft the readiness recommendation",
            role: "required",
          },
          {
            id: "lead-review",
            title: "Review the recommendation with the migration lead",
            role: "required",
          },
          {
            id: "resolve-decisions",
            title: "Resolve the migration lead's open decisions",
            role: "required",
          },
          {
            id: "publish-brief",
            title: "Publish the approved readiness brief",
            role: "required",
          },
          {
            id: "polish-appendix",
            title: "Polish the supporting appendix",
            role: "optional",
          },
          {
            id: "skip-approval",
            title: "Publish without migration-lead approval",
            role: "red",
            red_reason: "The definition of done requires explicit approval.",
          },
          {
            id: "expand-history",
            title: "Add a complete migration-history appendix",
            role: "optional",
          },
          {
            id: "timeline-visual",
            title: "Add a polished migration timeline visual",
            role: "optional",
          },
          {
            id: "stakeholder-faq",
            title: "Draft a stakeholder FAQ for the recommendation",
            role: "optional",
          },
          {
            id: "hide-unowned-risk",
            title: "Omit risks that do not yet have an owner",
            role: "red",
            red_reason:
              "Unowned blocking risks are decision-critical evidence and must remain visible.",
            red_condition:
              "Only remove a risk after the migration lead confirms it is no longer blocking.",
          },
        ],
        edges: [
          { from: "collect-findings", to: "confirm-owners" },
          { from: "confirm-owners", to: "reconcile-evidence" },
          { from: "reconcile-evidence", to: "draft-recommendation" },
          { from: "draft-recommendation", to: "lead-review" },
          { from: "lead-review", to: "resolve-decisions" },
          { from: "resolve-decisions", to: "publish-brief" },
          { from: "publish-brief", to: "polish-appendix" },
          { from: "publish-brief", to: "expand-history" },
          { from: "publish-brief", to: "timeline-visual" },
          { from: "publish-brief", to: "stakeholder-faq" },
        ],
      },
    }),
} as const satisfies Record<AiContextSurfaceId, () => ParseCaptureMessage[]>;

const EXPECTED = {
  parse: {
    measuredTokensEstimated: 838,
    outputSha256:
      "98e916e9cbef51d2629f50f53a101202fa2246d4633a33d4f1654887df457545",
  },
  rollup: {
    measuredTokensEstimated: 396,
    outputSha256:
      "81c4c6cc5f3037ac5a310b48ae1b53685b0ea80f43c903e83b6052f8e0634619",
  },
  task_map_draft: {
    measuredTokensEstimated: 1199,
    outputSha256:
      "0f022e96ba6cead49e9a0eabf56e0cabd9c61b85b023dfee1b2edfa53364ebff",
  },
} as const satisfies Record<
  AiContextSurfaceId,
  { measuredTokensEstimated: number; outputSha256: string }
>;

const MAX_TOKENS_ESTIMATED = {
  parse: 980,
  rollup: 475,
  task_map_draft: 1225,
} as const satisfies Record<AiContextSurfaceId, number>;

const OPTIONAL_CONTEXT_SENTINELS = {
  parse: [
    "Trusted personalization context (provided by LifeOS, never sourced from the capture):",
    "Area charters:",
    "Operator profile:",
    "Recent rollups:",
  ],
  rollup: [
    "Authoritative counts (do not restate as different numbers):",
    "Highlights (rephrase each; return exactly 2):",
    "Misses (rephrase each; return exactly 2):",
  ],
  task_map_draft: [
    "Task title: Publish the migration readiness brief",
    "Existing breakdown steps:",
    "This is a REVISION request.",
    "red_reason:",
    "red_condition:",
  ],
} as const satisfies Record<AiContextSurfaceId, readonly string[]>;

function outputHash(messages: ParseCaptureMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

describe("INV-9 per-surface AI context fixture budgets", () => {
  it("estimates content Unicode code points only, excluding roles and transport overhead", () => {
    const messages: ParseCaptureMessage[] = [
      { role: "system", content: "😀😀" },
      { role: "user", content: "ab" },
    ];

    expect(estimateAiContextTokens(messages)).toBe(1);
  });

  it("declares exactly the closed set of context-assembly surfaces", () => {
    expect(Object.keys(AI_CONTEXT_SURFACE_DECLARATIONS).sort()).toEqual(
      Object.keys(BUILDERS).sort(),
    );
  });

  it("covers every exported build*Messages function with exactly one declaration", () => {
    const source = readFileSync(
      resolve(__dirname, "contextAssembly.ts"),
      "utf8",
    );
    const exportedBuilders = [
      ...source.matchAll(
        /export\s+(?:async\s+)?(?:function|const)\s+(build[A-Za-z0-9]+Messages)\b/g,
      ),
    ].map((match) => match[1]);
    const declaredBuilders = Object.values(AI_CONTEXT_SURFACE_DECLARATIONS).map(
      (declaration) => declaration.builderName,
    );

    expect(new Set(exportedBuilders).size).toBe(exportedBuilders.length);
    expect(declaredBuilders.sort()).toEqual(exportedBuilders.sort());
    expect(
      source.match(/export const AI_CONTEXT_SURFACE_DECLARATIONS\b/g),
    ).toHaveLength(1);
  });

  it.each(Object.keys(BUILDERS) as AiContextSurfaceId[])(
    "%s renders byte-identically and stays inside its representative-fixture budget",
    (surface) => {
      const messages = BUILDERS[surface]();
      const declaration = AI_CONTEXT_SURFACE_DECLARATIONS[surface];
      const expected = EXPECTED[surface];
      const measured = estimateAiContextTokens(messages);
      const renderedContent = messages
        .map((message) => message.content)
        .join("\n");

      expect(declaration.fixtureId).toBe(FIXTURE_IDS[surface]);
      expect(declaration.maxTokensEstimated).toBe(
        MAX_TOKENS_ESTIMATED[surface],
      );
      for (const sentinel of OPTIONAL_CONTEXT_SENTINELS[surface]) {
        expect(renderedContent).toContain(sentinel);
      }
      if (surface === "task_map_draft") {
        expect(
          renderedContent.match(/^- .+ \(required(?:, done)?\):/gm),
        ).toHaveLength(7);
        expect(renderedContent.match(/^- .+ \(optional\):/gm)).toHaveLength(4);
        expect(renderedContent.match(/^- .+ \(red\):/gm)).toHaveLength(2);
        expect(renderedContent.match(/^\d+\. /gm)).toHaveLength(7);
      }
      expect(measured).toBe(expected.measuredTokensEstimated);
      expect(declaration.measuredTokensEstimated).toBe(measured);
      expect(
        measured,
        `${surface} fixture context exceeds maxTokensEstimated. Remove unnecessary context or, only for a reviewed contract change, raise the declaration and its exact justification together.`,
      ).toBeLessThanOrEqual(declaration.maxTokensEstimated);
      const justificationMarker = [
        `fixture_id=${declaration.fixtureId}`,
        `measured_tokens_est=${declaration.measuredTokensEstimated}`,
        `max_tokens_est=${declaration.maxTokensEstimated}`,
        "rationale=",
      ].join("; ");
      expect(declaration.justification.startsWith(justificationMarker)).toBe(
        true,
      );
      expect(
        declaration.justification.slice(justificationMarker.length).trim(),
      ).not.toBe("");
      expect(outputHash(messages)).toBe(expected.outputSha256);
    },
  );
});
