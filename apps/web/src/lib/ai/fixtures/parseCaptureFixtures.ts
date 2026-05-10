import type { ParseCaptureResponse } from "@lifeos/schemas";
import { PARSE_CAPTURE_SCHEMA_VERSION } from "../contracts/parseCapture";
import { PARSE_CAPTURE_PROMPT_VERSION } from "../prompts/parseCapturePrompt";

export const parseCaptureRegressionFixtures: Record<
  string,
  ParseCaptureResponse
> = {
  simpleTask: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "parsed",
    overall_confidence: 0.92,
    triage_required: false,
    triage_reasons: [],
    drafts: [
      {
        draft_type: "task_draft",
        title: "Email Alex about event sponsorship follow-up",
        description:
          "Send the sponsor follow-up with the latest attendee estimate.",
        area_slug_suggestion: "volunteer-work",
        first_tiny_step:
          "Open the sponsor thread and paste the update template.",
        estimated_minutes_low: 15,
        estimated_minutes_high: 25,
        due_at: "2026-05-10T15:00:00.000Z",
        confidence: 0.92,
      },
    ],
    clarification_questions: [],
    ambiguity_assessment: null,
  },
  ambiguousProject: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "needs_clarification",
    overall_confidence: 0.61,
    triage_required: true,
    triage_reasons: [
      "Capture mixes goals and execution details without one clear objective.",
    ],
    drafts: [
      {
        draft_type: "project_draft",
        title: "Stabilize volunteer operations workflow",
        description:
          "Consolidate event prep, staffing, and sponsorship tracking into one flow.",
        area_slug_suggestion: "volunteer-work",
        confidence: 0.61,
      },
      {
        draft_type: "task_draft",
        title: "List current volunteer ops pain points",
        description: "Capture known breakdowns before selecting tooling.",
        area_slug_suggestion: "volunteer-work",
        first_tiny_step: "Write five concrete blockers from last event.",
        estimated_minutes_low: 30,
        estimated_minutes_high: 45,
        due_at: null,
        confidence: 0.67,
      },
    ],
    clarification_questions: [
      "What does success look like for this ops reset in one sentence?",
    ],
    ambiguity_assessment: {
      likely_objective:
        "Reduce operational chaos before the next volunteer event.",
      problem_type: "project",
      complexity_level: "complex",
      knowns: [
        "Operations feel fragmented.",
        "Next event timeline is approaching.",
      ],
      unknowns: ["Single owner", "Scope boundary", "Success metric"],
      assumptions: ["Current process is inconsistent across events."],
      constraints: ["No broad tool migration this week."],
      risks: ["Prematurely committing to a full redesign."],
      dependencies: ["Volunteer lead availability"],
      recommended_first_move:
        "Define objective and non-goals before task expansion.",
      what_not_to_do_yet: ["Do not create a full roadmap before triage."],
      confidence: 0.58,
      review_trigger: "Objective and scope are still ambiguous.",
    },
  },
  multiAreaAmbiguity: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "needs_clarification",
    overall_confidence: 0.57,
    triage_required: true,
    triage_reasons: ["Capture overlaps Main Job and Side Project areas."],
    drafts: [
      {
        draft_type: "task_draft",
        title: "Draft architecture notes for auth flow",
        description:
          "Capture decisions that impact both personal project and work implementation.",
        area_slug_suggestion: null,
        first_tiny_step:
          "Split notes into work-owned and side-project-owned sections.",
        estimated_minutes_low: 20,
        estimated_minutes_high: 40,
        due_at: null,
        confidence: 0.6,
      },
    ],
    clarification_questions: [
      "Should this live under Main Job or Side Project?",
    ],
    ambiguity_assessment: {
      likely_objective: "Separate mixed ownership work into one clear area.",
      problem_type: "decision",
      complexity_level: "moderate",
      knowns: ["Two area contexts are present in one capture."],
      unknowns: ["Primary owner area"],
      assumptions: ["Splitting by ownership reduces follow-up confusion."],
      constraints: ["No duplicate tasks across two areas."],
      risks: ["Cross-area leakage into wrong backlog."],
      dependencies: ["User area decision"],
      recommended_first_move: "Choose one owner area before accepting drafts.",
      what_not_to_do_yet: ["Do not schedule until area ownership is explicit."],
      confidence: 0.55,
      review_trigger: "Area routing ambiguity.",
    },
  },
  proposedTimeBlock: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "parsed",
    overall_confidence: 0.81,
    triage_required: false,
    triage_reasons: [],
    drafts: [
      {
        draft_type: "task_draft",
        title: "Prepare Monday planning packet",
        description: "Compile agenda, blockers, and dependencies for planning.",
        area_slug_suggestion: "main-job",
        first_tiny_step: "Create a 45-minute focused prep block note.",
        estimated_minutes_low: 45,
        estimated_minutes_high: 60,
        due_at: "2026-05-11T13:00:00.000Z",
        confidence: 0.81,
      },
    ],
    clarification_questions: [],
    ambiguity_assessment: null,
  },
  blockerMissingInfo: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "needs_clarification",
    overall_confidence: 0.52,
    triage_required: true,
    triage_reasons: [
      "Critical missing info: owner and external dependency are unknown.",
    ],
    drafts: [
      {
        draft_type: "task_draft",
        title: "Unblock vendor contract follow-up",
        description:
          "A dependency is blocked but responsible owner is missing.",
        area_slug_suggestion: "main-job",
        first_tiny_step: null,
        estimated_minutes_low: null,
        estimated_minutes_high: null,
        due_at: null,
        confidence: 0.52,
      },
    ],
    clarification_questions: [
      "Who owns vendor follow-up and what is the blocker detail?",
    ],
    ambiguity_assessment: {
      likely_objective: "Resolve blocker ownership before scheduling.",
      problem_type: "unknown",
      complexity_level: "unclear",
      knowns: ["A blocker exists."],
      unknowns: ["Owner", "Dependency details", "Deadline"],
      assumptions: ["The blocker is external and cannot be solved solo."],
      constraints: ["No external action without clear owner."],
      risks: ["Task accepted without unblock path."],
      dependencies: ["Owner confirmation"],
      recommended_first_move: "Identify owner and blocker details in triage.",
      what_not_to_do_yet: ["Do not commit a time block before owner is known."],
      confidence: 0.5,
      review_trigger: "Missing owner/dependency fields.",
    },
  },
  lowConfidenceOutput: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "low_confidence",
    overall_confidence: 0.39,
    triage_required: true,
    triage_reasons: ["Overall confidence is below threshold."],
    drafts: [
      {
        draft_type: "task_draft",
        title: "Maybe handle admin cleanup",
        description: null,
        area_slug_suggestion: null,
        first_tiny_step: null,
        estimated_minutes_low: null,
        estimated_minutes_high: null,
        due_at: null,
        confidence: 0.39,
      },
    ],
    clarification_questions: [
      "What concrete outcome do you want from this capture?",
    ],
    ambiguity_assessment: null,
  },
  messyBrainDump: {
    schema_version: PARSE_CAPTURE_SCHEMA_VERSION,
    prompt_version: PARSE_CAPTURE_PROMPT_VERSION,
    parse_status: "needs_clarification",
    overall_confidence: 0.64,
    triage_required: true,
    triage_reasons: [
      "Capture contains multiple unrelated threads and emotional overload.",
    ],
    drafts: [
      {
        draft_type: "task_draft",
        title: "Extract top three urgent actions from brain dump",
        description: "Convert noisy notes into one prioritized short list.",
        area_slug_suggestion: "personal",
        first_tiny_step: "Highlight the three lines with real deadlines.",
        estimated_minutes_low: 20,
        estimated_minutes_high: 30,
        due_at: null,
        confidence: 0.66,
      },
    ],
    clarification_questions: ["Which single thread is most urgent today?"],
    ambiguity_assessment: {
      likely_objective: "Reduce overwhelm by selecting one immediate thread.",
      problem_type: "decision",
      complexity_level: "moderate",
      knowns: ["Multiple concerns are mixed."],
      unknowns: ["Priority order", "Deadline-critical item"],
      assumptions: [
        "Small selection-first strategy is safer than broad planning.",
      ],
      constraints: ["Limit first move to 30 minutes."],
      risks: ["Trying to solve everything in one pass."],
      dependencies: [],
      recommended_first_move:
        "Choose one urgent thread and draft a single next action.",
      what_not_to_do_yet: [
        "Do not create tasks for every line in the dump yet.",
      ],
      confidence: 0.63,
      review_trigger: "Overloaded capture needs triage-first reduction.",
    },
  },
};
