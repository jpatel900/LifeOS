"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import type {
  Phase2TaskDraft,
  Phase2TimeBlockProposal,
} from "@lifeos/schemas";
import {
  acceptDraft,
  acceptProposal,
  createInitialWorkflowState,
  editDraft,
  markCurrentSession,
  rejectDraft,
  rejectProposal,
  startExecutionSession,
  submitCapture,
  syncWorkflowIdCounterFromState,
  updateProposal,
  type WorkflowState,
} from "./workflow";
import type { ExecutionSession } from "./types";

const STORAGE_KEY = "lifeos.phase2.workflow";

type WorkflowAction =
  | {
      type: "submitCapture";
      rawText: string;
      areaId: string | null;
    }
  | {
      type: "acceptDraft";
      draftId: string;
    }
  | {
      type: "rejectDraft";
      draftId: string;
    }
  | {
      type: "editDraft";
      draftId: string;
      changes: Pick<Phase2TaskDraft, "title" | "description">;
    }
  | {
      type: "acceptProposal";
      proposalId: string;
    }
  | {
      type: "rejectProposal";
      proposalId: string;
    }
  | {
      type: "updateProposal";
      proposalId: string;
      changes: Pick<
        Phase2TimeBlockProposal,
        "proposed_start" | "proposed_end" | "rationale"
      >;
    }
  | {
      type: "startSession";
      taskId: string;
    }
  | {
      type: "markSession";
      status: ExecutionSession["status"];
    }
  | {
      type: "reset";
    };

interface WorkflowContextValue {
  state: WorkflowState;
  selectedAreaId: string | null;
  setSelectedAreaId: (areaId: string | null) => void;
  submitCaptureText: (rawText: string, areaId: string | null) => void;
  acceptTaskDraft: (draftId: string) => void;
  rejectTaskDraft: (draftId: string) => void;
  editTaskDraft: (
    draftId: string,
    changes: Pick<Phase2TaskDraft, "title" | "description">,
  ) => void;
  acceptLocalProposal: (proposalId: string) => void;
  rejectLocalProposal: (proposalId: string) => void;
  editLocalProposal: (
    proposalId: string,
    changes: Pick<Phase2TimeBlockProposal, "proposed_start" | "proposed_end" | "rationale">,
  ) => void;
  startTaskSession: (taskId: string) => void;
  markSession: (status: ExecutionSession["status"]) => void;
  resetWorkflow: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "submitCapture":
      return submitCapture(state, {
        rawText: action.rawText,
        areaId: action.areaId,
      });
    case "acceptDraft":
      return acceptDraft(state, action.draftId);
    case "rejectDraft":
      return rejectDraft(state, action.draftId);
    case "editDraft":
      return editDraft(state, action.draftId, action.changes);
    case "acceptProposal":
      return acceptProposal(state, action.proposalId);
    case "rejectProposal":
      return rejectProposal(state, action.proposalId);
    case "updateProposal":
      return updateProposal(state, action.proposalId, action.changes);
    case "startSession":
      return startExecutionSession(state, action.taskId);
    case "markSession":
      return markCurrentSession(state, action.status);
    case "reset":
      return createInitialWorkflowState();
    default:
      return state;
  }
}

function loadInitialState() {
  if (typeof window === "undefined") {
    const initial = createInitialWorkflowState();
    syncWorkflowIdCounterFromState(initial);
    return initial;
  }

  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const initial = createInitialWorkflowState();
    syncWorkflowIdCounterFromState(initial);
    return initial;
  }

  try {
    const parsed = JSON.parse(stored) as WorkflowState;
    syncWorkflowIdCounterFromState(parsed);
    return parsed;
  } catch {
    const initial = createInitialWorkflowState();
    syncWorkflowIdCounterFromState(initial);
    return initial;
  }
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, undefined, loadInitialState);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(
    state.areas[0]?.id ?? null,
  );

  useEffect(() => {
    syncWorkflowIdCounterFromState(state);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value: WorkflowContextValue = {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText: (rawText, areaId) =>
      dispatch({ type: "submitCapture", rawText, areaId }),
    acceptTaskDraft: (draftId) => dispatch({ type: "acceptDraft", draftId }),
    rejectTaskDraft: (draftId) => dispatch({ type: "rejectDraft", draftId }),
    editTaskDraft: (draftId, changes) =>
      dispatch({ type: "editDraft", draftId, changes }),
    acceptLocalProposal: (proposalId) =>
      dispatch({ type: "acceptProposal", proposalId }),
    rejectLocalProposal: (proposalId) =>
      dispatch({ type: "rejectProposal", proposalId }),
    editLocalProposal: (proposalId, changes) =>
      dispatch({ type: "updateProposal", proposalId, changes }),
    startTaskSession: (taskId) => dispatch({ type: "startSession", taskId }),
    markSession: (status) => dispatch({ type: "markSession", status }),
    resetWorkflow: () => dispatch({ type: "reset" }),
  };

  return (
    <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const value = useContext(WorkflowContext);
  if (!value) {
    throw new Error("useWorkflow must be used inside WorkflowProvider.");
  }
  return value;
}

