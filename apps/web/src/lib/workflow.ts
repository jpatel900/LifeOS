// This file is a barrel re-export of apps/web/src/lib/workflow/*.ts.
// #590 slice 6 paydown: workflow.ts was split by stage domain into
// ./workflow/{shared,wip,capture,triage,planning,taskMap,execution,review,
// wipSwap}.ts (mirrors the lib/data/workflow.ts split from #538). This
// barrel preserves the original public export surface byte-for-byte so no
// import site needs to change.

// --- shared ---
export {
  WIP_ENFORCEMENT_POLICY_ID,
  WIP_ENFORCEMENT_LIMIT,
  syncWorkflowIdCounterFromState,
  createInitialWorkflowState,
  hasLaunchSequenceStep,
} from "./workflow/shared";
export type {
  WipSlotHolder,
  WipRefusal,
  WorkflowState,
} from "./workflow/shared";

// --- wip ---
export { getWipSlotHolders, clearWipRefusal } from "./workflow/wip";

// --- wipSwap ---
export { swapWipSlot } from "./workflow/wipSwap";

// --- capture ---
export {
  mockParseCapture,
  createRawCaptureItem,
  appendRawCapture,
  submitCapture,
  submitRawCapture,
  appendParsedWorkflowResult,
} from "./workflow/capture";

// --- triage ---
export {
  editDraft,
  rejectPersonMention,
  splitDraft,
  mergeDrafts,
  rejectDraft,
  rejectProjectDraft,
  acceptProjectDraft,
  acceptDraft,
  addWorkflowArea,
  updateWorkflowAreaColor,
  backlogDraft,
  promoteBacklogTask,
} from "./workflow/triage";

// --- planning ---
export {
  planTaskAtHour,
  updateTaskFirstTinyStep,
  unplanTask,
  createLocalProposalFromTask,
  updateProposal,
  rejectProposal,
  acceptProposal,
  applyGoogleCalendarWriteResult,
  applyGoogleCalendarCancelResult,
} from "./workflow/planning";

// --- taskMap ---
export {
  approveTaskMapLocal,
  toggleTaskMapNodeCompletionLocal,
} from "./workflow/taskMap";

// --- execution ---
export {
  startExecutionSession,
  markCurrentSession,
} from "./workflow/execution";

// --- review ---
export {
  carryForwardTask,
  deferTask,
  dropTask,
  saveReview,
} from "./workflow/review";
