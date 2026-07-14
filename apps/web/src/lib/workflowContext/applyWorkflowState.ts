// WorkflowContext domain module — shared local-state apply helper.
//
// Extracted from lib/WorkflowContext.tsx (issue #590 slice 4, mechanical
// split only). `applyWorkflowState` is the one place that writes a new
// WorkflowState both into the stateRef (for synchronous reads elsewhere in
// the same render/microtask) and into the reducer (for the next render). It
// is shared by the persistence-sync, capture-parse, and calendar-approval
// domain modules, so it lives in its own tiny factory rather than inside any
// one of them.
import type { Dispatch, MutableRefObject } from "react";
import {
  syncWorkflowIdCounterFromState,
  type WorkflowState,
} from "../workflow";
import type { WorkflowAction } from "./reducerCore";

export function createApplyWorkflowState(
  stateRef: MutableRefObject<WorkflowState>,
  dispatch: Dispatch<WorkflowAction>,
) {
  return function applyWorkflowState(nextState: WorkflowState) {
    stateRef.current = nextState;
    syncWorkflowIdCounterFromState(nextState);
    dispatch({ type: "hydrate", state: nextState });
  };
}

export type ApplyWorkflowState = ReturnType<typeof createApplyWorkflowState>;
