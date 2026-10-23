/**
 * W3-16 finding 10: golden captures evaluated on FRESH model output.
 *
 * `goldenCaptures.eval.test.ts` replays RECORDED responses, so it proves the
 * parser, schema and pipeline, not what today's prompt and model produce. A
 * prompt or model change can degrade ambiguity handling while every recorded
 * case stays green. This file sends the same synthetic golden cases through
 * the real `parseCapture` and the real provider, and checks the same
 * structural outcomes (never exact wording).
 *
 * OPT-IN ONLY. It calls a paid provider, so it never runs in CI or in a
 * normal `pnpm test`. Running it is a spending decision for the owner:
 *
 *   LIFEOS_LIVE_PROVIDER_EVAL=1 OPENAI_API_KEY=... AI_MODEL_STANDARD=... \
 *     pnpm --filter @lifeos/web test goldenCaptures.live.eval
 *
 * Optional: LIFEOS_LIVE_EVAL_REPEATS=<n> (default 1, max 5) repeats every
 * case to expose run-to-run variability. Only synthetic fixture text is sent.
 */
import { describe, expect, it } from "vitest";
import { ParseCaptureResponseSchema } from "@lifeos/schemas";
import { PARSE_CAPTURE_PROMPT_VERSION } from "./prompts/parseCapturePrompt";
import { parseCapture } from "./parseCapture";
import { goldenCaptureCases } from "./fixtures/goldenCaptures";

const runLiveEval =
  process.env.LIFEOS_LIVE_PROVIDER_EVAL === "1" &&
  Boolean(process.env.OPENAI_API_KEY) &&
  Boolean(process.env.AI_MODEL_STANDARD);
// QA doctrine #269: deliberate paid-provider opt-in gate (W3-16 #10). Default
// runs skip; LIFEOS_LIVE_PROVIDER_EVAL=1 plus provider env enables it.
const describeLiveEval = runLiveEval ? describe : describe.skip;

const repeats = Math.min(
  5,
  Math.max(1, Number(process.env.LIFEOS_LIVE_EVAL_REPEATS ?? "1") || 1),
);

describeLiveEval(
  `golden captures on fresh model output (prompt ${PARSE_CAPTURE_PROMPT_VERSION})`,
  () => {
    for (const goldenCase of goldenCaptureCases) {
      for (let run = 1; run <= repeats; run += 1) {
        it(`${goldenCase.id} (run ${run}/${repeats})`, async () => {
          const response = await parseCapture({ rawText: goldenCase.rawText });
          const { expected, id } = goldenCase;

          expect(
            ParseCaptureResponseSchema.safeParse(response).success,
            `fresh output failed the strict schema: ${id}`,
          ).toBe(true);
          expect(response.prompt_version).toBe(PARSE_CAPTURE_PROMPT_VERSION);

          expect(
            expected.allowedParseStatuses,
            `parse_status "${response.parse_status}" not allowed: ${id}`,
          ).toContain(response.parse_status);
          expect(
            response.triage_required,
            `triage_required mismatch: ${id}`,
          ).toBe(expected.triageRequired);

          const taskDrafts = response.drafts.filter(
            (draft) => draft.draft_type === "task_draft",
          );
          const projectDrafts = response.drafts.filter(
            (draft) => draft.draft_type === "project_draft",
          );
          expect(
            taskDrafts.length,
            `too few task drafts: ${id}`,
          ).toBeGreaterThanOrEqual(expected.minTaskDrafts);
          expect(
            projectDrafts.length,
            `too few project drafts: ${id}`,
          ).toBeGreaterThanOrEqual(expected.minProjectDrafts);

          if (expected.requiresClarificationQuestion) {
            expect(
              response.clarification_questions.length,
              `expected a clarification question: ${id}`,
            ).toBeGreaterThan(0);
          }
          if (!expected.allowsExactDueDate) {
            for (const draft of taskDrafts) {
              expect(
                draft.due_at,
                `fabricated exact timeline for vague work: ${id}`,
              ).toBeNull();
            }
          }

          if (expected.ambiguity) {
            const assessment = response.ambiguity_assessment;
            expect(
              assessment,
              `missing ambiguity assessment: ${id}`,
            ).not.toBeNull();
            if (assessment) {
              expect(expected.ambiguity.problemTypes).toContain(
                assessment.problem_type,
              );
              expect(expected.ambiguity.complexityLevels).toContain(
                assessment.complexity_level,
              );
              expect(assessment.unknowns.length).toBeGreaterThan(0);
              expect(assessment.recommended_first_move).toBeTruthy();
              expect(assessment.what_not_to_do_yet.length).toBeGreaterThan(0);
              expect(assessment.review_trigger).toBeTruthy();
            }
          }
        }, 60_000);
      }
    }
  },
);
