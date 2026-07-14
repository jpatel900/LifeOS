// This file is a barrel re-export of apps/web/src/lib/data/workflow/*.ts.
// KNOWN_ISSUES row 8 paydown: workflow.ts was split by domain into
// ./workflow/{shared,metaLearning,taskMap,people,areas,capture,planning,
// calendar,execution,rollups}.ts. This barrel preserves the original public
// export surface byte-for-byte so no import site needs to change.

// --- shared ---
export {
  GoogleCalendarEventCreateError,
  mockAreas,
  areaColumns,
  captureColumns,
  taskColumns,
  timeBlockProposalColumns,
  calendarBlockColumns,
  executionSessionColumns,
  reviewEntryColumns,
} from "./workflow/shared";
export type {
  DataProvider,
  DataResult,
  AreaListResult,
  AreaCreateResult,
  AreaSoftDeleteResult,
  AreaColorUpdateResult,
  CaptureCreateResult,
  CaptureListResult,
  TaskCreateResult,
  ProjectCreateResult,
  PlanningItemsResult,
  TimeBlockProposalCreateResult,
  TimeBlockProposalUpdateResult,
  TimeBlockProposalAcceptResult,
  TimeBlockProposalConflictCheckResult,
  GoogleCalendarEventCreateResult,
  ExecutionReviewItemsResult,
  ExecutionSessionCreateResult,
  ExecutionSessionMarkResult,
  ReviewEntryCreateResult,
  WinHarvestCandidate,
  WinHarvestCandidatesResult,
  WinRecordCreateResult,
  WinRecordsResult,
  RollupSummaryCreateResult,
  RollupSummariesResult,
  DurationProfileUpsertResult,
  DurationProfilesResult,
  ReviewTaskTargetStatus,
  CalendarBlockUnplanResult,
  TaskReviewTransitionResult,
  MinimalSupabaseClient,
} from "./workflow/shared";

// --- metaLearning ---
export {
  createSuggestionRecord,
  createOverrideRecord,
  recordWipEnforcementEvent,
  recordRejectedTaskDraft,
  RE_ENTRY_POLICY_ID,
  recordReEntryDeferral,
  DURATION_RECALIBRATION_POLICY_ID,
  recordPolicyProposalDecision,
  recordDurationRecalibrationDecision,
  PERSON_LINK_POLICY_ID,
  COMMITMENT_POLICY_ID,
  recordPersonMentionProposal,
  recordCommitmentProposal,
  recordPersonLinkRejection,
  listOverrideRecords,
  listSuggestionRecords,
} from "./workflow/metaLearning";
export type {
  WipEnforcementRecordInput,
  RejectedTaskDraftInput,
  ReEntryDeferralRecordInput,
  PolicyProposalDecisionInput,
  DurationRecalibrationDecisionInput,
  PersonMentionProposalInput,
  CommitmentProposalInput,
  PersonLinkRejectionInput,
  OverrideRecordsResult,
  SuggestionRecordsResult,
} from "./workflow/metaLearning";

// --- taskMap ---
export {
  TASK_MAP_DRAFT_POLICY_ID,
  recordTaskMapDraftSuggestion,
  approveTaskMap,
  setTaskMapNodeCompletion,
} from "./workflow/taskMap";
export type {
  TaskMapDraftSuggestionNodeCounts,
  TaskMapDraftSuggestionInput,
  TaskMapDraftSuggestionResult,
  ApproveTaskMapAiDraft,
  ApproveTaskMapInput,
  TaskMapApproveResult,
  SetTaskMapNodeCompletionInput,
  TaskMapNodeCompletionResult,
} from "./workflow/taskMap";

// --- people ---
export {
  listPeople,
  findOrCreatePerson,
  recordPersonLinkAcceptance,
  getOperatorProfile,
} from "./workflow/people";
export type {
  PersonFindOrCreateResult,
  PersonLinkAcceptanceInput,
} from "./workflow/people";

// --- areas ---
export {
  listAreas,
  createArea,
  softDeleteArea,
  updateAreaColor,
} from "./workflow/areas";

// --- capture ---
export {
  createCaptureItem,
  syncQueuedCapture,
  listCaptureItems,
} from "./workflow/capture";
export type { SyncQueuedCaptureInput } from "./workflow/capture";

// --- planning ---
export {
  createTask,
  createProject,
  listPlanningItems,
} from "./workflow/planning";

// --- calendar ---
export {
  createTimeBlockProposal,
  editTimeBlockProposal,
  rejectTimeBlockProposal,
  supersedePendingTimeBlockProposalsForTask,
  acceptTimeBlockProposal,
  checkTimeBlockProposalConflict,
  createGoogleCalendarEventFromProposal,
} from "./workflow/calendar";

// --- execution ---
export {
  listExecutionReviewItems,
  createExecutionSession,
  markExecutionSession,
  unplanCalendarBlock,
  applyTaskReviewTransition,
  createReviewEntry,
} from "./workflow/execution";

// --- rollups ---
export {
  createWinRecord,
  listWinHarvestCandidates,
  listWinRecords,
  createRollupSummary,
  listRollupSummaries,
  listDurationProfiles,
  upsertDurationProfile,
} from "./workflow/rollups";
