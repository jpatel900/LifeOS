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
  acceptProjectDraft,
  acceptProposal,
  createInitialWorkflowState,
  editDraft,
  markCurrentSession,
  rejectDraft,
  rejectProjectDraft,
  rejectProposal,
  startExecutionSession,
  submitCapture,
  syncWorkflowIdCounterFromState,
  updateProposal,
  type WorkflowState,
} from "./workflow";
import type { Phase2MockExecutionSession } from "./types";

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
      type: "acceptProjectDraft";
      draftId: string;
    }
  | {
      type: "rejectDraft";
      draftId: string;
    }
  | {
      type: "rejectProjectDraft";
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
      status: Phase2MockExecutionSession["status"];
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
  acceptProjectDraft: (draftId: string) => void;
  rejectTaskDraft: (draftId: string) => void;
  rejectProjectDraft: (draftId: string) => void;
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
  markSession: (status: Phase2MockExecutionSession["status"]) => void;
  resetWorkflow: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function createSyncedInitialState() {
  const initial = createInitialWorkflowState();
  syncWorkflowIdCounterFromState(initial);
  return initial;
}

function normalizeWorkflowState(state: WorkflowState): WorkflowState {
  return {
    ...state,
    projectDrafts: state.projectDrafts ?? [],
    projects: state.projects ?? [],
  };
}

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "submitCapture":
      return submitCapture(state, {
        rawText: action.rawText,
        areaId: action.areaId,
      });
    case "acceptDraft":
      return acceptDraft(state, action.draftId);
    case "acceptProjectDraft":
      return acceptProjectDraft(state, action.draftId);
    case "rejectDraft":
      return rejectDraft(state, action.draftId);
    case "rejectProjectDraft":
      return rejectProjectDraft(state, action.draftId);
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
      return createSyncedInitialState();
    default:
      return state;
  }
}

function loadInitialState() {
  if (typeof window === "undefined") {
    return createSyncedInitialState();
  }

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createSyncedInitialState();
    }

    const parsed = normalizeWorkflowState(JSON.parse(stored) as WorkflowState);
    syncWorkflowIdCounterFromState(parsed);
    return parsed;
  } catch {
    return createSyncedInitialState();
  }
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, undefined, loadInitialState);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(
    state.areas[0]?.id ?? null,
  );

  useEffect(() => {
    syncWorkflowIdCounterFromState(state);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Workflow state must remain usable when browser storage is blocked.
    }
  }, [state]);

  const value: WorkflowContextValue = {
    state,
    selectedAreaId,
    setSelectedAreaId,
    submitCaptureText: (rawText, areaId) =>
      dispatch({ type: "submitCapture", rawText, areaId }),
    acceptTaskDraft: (draftId) => dispatch({ type: "acceptDraft", draftId }),
    acceptProjectDraft: (draftId) =>
      dispatch({ type: "acceptProjectDraft", draftId }),
    rejectTaskDraft: (draftId) => dispatch({ type: "rejectDraft", draftId }),
    rejectProjectDraft: (draftId) =>
      dispatch({ type: "rejectProjectDraft", draftId }),
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

