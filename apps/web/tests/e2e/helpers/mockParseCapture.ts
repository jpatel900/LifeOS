import type { Page } from "@playwright/test";

/**
 * HIGH-1 (#670): /api/parse-capture now requires a verified bearer token, and
 * the E2E dev server runs without Supabase env, so the real route answers 401
 * for every request — there is no authenticated E2E posture. Like the
 * task-map lifecycle spec, capture specs therefore stub the route with the
 * exact payload the server's deterministic mock parser produces for the
 * spec's capture text. The real-route contract (auth required, mock parse,
 * degrade envelope) is proven by the vitest route tests
 * (src/app/api/parse-capture/route.test.ts) and the authenticated weekly
 * prod smoke.
 *
 * The response mirrors buildMockResponse in
 * src/lib/ai/parseCaptureService.ts for a short, non-project-shaped capture
 * (title === trimmed raw text). Keep in sync if that mock changes.
 */
export function buildMockParseCaptureBody(rawText: string) {
  const title = rawText
    .trim()
    .replace(/^need to\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");

  return {
    ok: true,
    parser: "mock",
    status: "mock",
    degraded: false,
    response: {
      schema_version: "1.0",
      prompt_version: "parse_capture.v3",
      parse_status: "parsed",
      overall_confidence: 0.78,
      triage_required: true,
      triage_reasons: [
        "Mock parser output requires user review before persistence.",
      ],
      drafts: [
        {
          draft_type: "task_draft",
          title,
          description: `Draft created from capture: ${rawText.trim()}`,
          area_slug_suggestion: null,
          first_tiny_step: `Clarify the next concrete step for: ${title}`,
          estimated_minutes_low: 30,
          estimated_minutes_high: 60,
          due_at: null,
          task_type: "task",
          is_reversible: null,
          confidence: 0.78,
          breakdown: {
            steps: [
              {
                order: 1,
                title: `Clarify the next concrete step for: ${title}`,
                estimated_minutes: 10,
                depends_on_orders: [],
                on_critical_path: true,
              },
              {
                order: 2,
                title: `Do the core work for: ${title}`,
                estimated_minutes: 30,
                depends_on_orders: [1],
                on_critical_path: true,
              },
              {
                order: 3,
                title: `Confirm the outcome and capture follow-ups for: ${title}`,
                estimated_minutes: 10,
                depends_on_orders: [2],
                on_critical_path: true,
              },
            ],
            sequence_summary:
              "Clarify the step, do the core work, then confirm the outcome.",
            kickstart_step: `Open the capture and write one sentence defining done for: ${title}`,
          },
        },
      ],
      clarification_questions: [
        "What deadline or definition of done should this use?",
      ],
      ambiguity_assessment: {
        likely_objective: title,
        problem_type: "task",
        complexity_level: "unclear",
        knowns: [rawText.trim()],
        unknowns: ["Exact deadline", "Definition of done"],
        assumptions: ["This should become a task before scheduling."],
        constraints: ["No external calendar write during parsing."],
        risks: ["Committing before review may capture the wrong intent."],
        dependencies: ["User review in triage."],
        recommended_first_move: `Clarify the next concrete step for: ${title}`,
        what_not_to_do_yet: ["Do not schedule before triage."],
        confidence: 0.72,
        review_trigger: "Review in triage before committing task.",
      },
    },
  };
}

/** Stubs POST /api/parse-capture with the deterministic mock-parser payload. */
export async function stubParseCaptureRoute(page: Page) {
  await page.route("**/api/parse-capture", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    const rawText =
      (route.request().postDataJSON() as { rawText?: string })?.rawText ?? "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildMockParseCaptureBody(rawText)),
    });
  });
}
