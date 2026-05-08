/**
 * Re-export inferred types from `@lifeos/schemas` — no duplicate domain interfaces.
 * Prefer importing Zod schemas from `@lifeos/schemas` for validation.
 */
export type {
  AmbiguityAssessment,
  Area,
  CalendarBlock,
  CaptureItem,
  ExecutionSession,
  HealthCheck,
  ModelTier,
  ParseCaptureDraft,
  ParseCaptureResponse,
  Project,
  ReviewEntry,
  Task,
  TimeBlockProposal,
  User,
} from "@lifeos/schemas";
