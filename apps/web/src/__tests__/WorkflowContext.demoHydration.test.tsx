import "fake-indexeddb/auto";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import {
  createEmptyWorkflowState,
  createSeededDemoWorkflowState,
  markDemoSeedCleared,
  workflowStateHasDemoSeed,
} from "@/lib/workflow";
import { STORAGE_KEY } from "@/lib/workflowContext/reducerCore";

// Exercise the real provider, reducer, storage and seed decisions. Only
// account transport is unavailable in these synthetic browser checks.
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => null,
}));

type ProbeState = {
  seeded: boolean;
  captures: string[];
  tasks: string[];
  reviewLog: string[];
  storage: string;
};
const clientRenders: ProbeState[] = [];
let root: Root | undefined;
let container: HTMLDivElement;

function Probe() {
  const { state, syncStatus, submitCaptureText } = useWorkflow();
  const snapshot: ProbeState = {
    seeded: workflowStateHasDemoSeed(state),
    captures: state.captureItems.map((item) => item.id),
    tasks: state.tasks.map((task) => task.id),
    reviewLog: [...state.reviewLog],
    storage: syncStatus.storage,
  };
  if (typeof window !== "undefined") clientRenders.push(snapshot);
  return (
    <>
      <output>{JSON.stringify(snapshot)}</output>
      <button
        onClick={() =>
          submitCaptureText("Synthetic new capture", "area-main-job")
        }
      >
        Add capture
      </button>
    </>
  );
}

async function hydrateProbe() {
  const tree = (
    <StrictMode>
      <WorkflowProvider>
        <Probe />
      </WorkflowProvider>
    </StrictMode>
  );
  const browserWindow = window;
  vi.stubGlobal("window", undefined);
  let html: string;
  try {
    html = renderToString(tree);
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
  container = document.createElement("div");
  container.innerHTML = html!;
  document.body.append(container);
  const serverState = JSON.parse(
    container.querySelector("output")!.textContent!,
  ) as ProbeState;
  const recoverableErrors: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    });
  });
  const read = () =>
    JSON.parse(container.querySelector("output")!.textContent!) as ProbeState;
  return { serverState, recoverableErrors, read };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DEMO_SEED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  window.sessionStorage.clear();
  window.localStorage.clear();
  clientRenders.length = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("demo state uses the same first server and browser render", () => {
  it("hydrates empty without an error, then seeds once without overwriting it with an empty snapshot", async () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const { serverState, recoverableErrors, read } = await hydrateProbe();
    expect(recoverableErrors).toEqual([]);
    expect(clientRenders[0]).toEqual(serverState);
    await waitFor(() => expect(read().seeded).toBe(true));
    const seeded = createSeededDemoWorkflowState();
    expect(read().captures).toEqual(seeded.captureItems.map((item) => item.id));
    expect(read().tasks).toEqual(seeded.tasks.map((task) => task.id));
    const workflowWrites = writes.mock.calls.filter(
      ([key]) => key === STORAGE_KEY,
    );
    expect(workflowWrites.length).toBeGreaterThan(0);
    for (const [, value] of workflowWrites) {
      expect(workflowStateHasDemoSeed(JSON.parse(value))).toBe(true);
    }
    fireEvent.click(container.querySelector("button")!);
    await waitFor(() =>
      expect(read().captures.length).toBe(seeded.captureItems.length + 1),
    );
    expect(new Set(read().captures).size).toBe(read().captures.length);
  });

  it("restores the existing snapshot and synchronizes generated IDs instead of adding another seed", async () => {
    const saved = createEmptyWorkflowState();
    saved.captureItems = [
      {
        ...createSeededDemoWorkflowState().captureItems[0]!,
        id: "capture-700",
      },
    ];
    saved.reviewLog = ["Synthetic saved review"];
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const { serverState, recoverableErrors, read } = await hydrateProbe();
    expect(clientRenders[0]).toEqual(serverState);
    expect(recoverableErrors).toEqual([]);
    expect(read().seeded).toBe(false);
    expect(read().captures).toEqual(["capture-700"]);
    expect(read().reviewLog).toEqual(saved.reviewLog);
    fireEvent.click(container.querySelector("button")!);
    await waitFor(() =>
      expect(read().captures).toEqual(["capture-701", "capture-700"]),
    );
  });

  for (const gate of ["reset", "disabled", "configured", "corrupt"] as const) {
    it(`stays unseeded after hydration when ${gate}`, async () => {
      if (gate === "reset") markDemoSeedCleared();
      if (gate === "disabled") vi.stubEnv("NEXT_PUBLIC_DEMO_SEED", "false");
      if (gate === "configured") {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-test-key");
      }
      if (gate === "corrupt")
        window.sessionStorage.setItem(STORAGE_KEY, "invalid-json");
      const { serverState, recoverableErrors, read } = await hydrateProbe();
      expect(clientRenders[0]).toEqual(serverState);
      expect(recoverableErrors).toEqual([]);
      expect(read().seeded).toBe(false);
      expect(read().captures).toEqual([]);
      if (gate === "corrupt") expect(read().storage).toBe("blocked");
    });
  }

  it("keeps sample data and the blocked-storage warning when the session store cannot be read", async () => {
    const browserSession = window.sessionStorage;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      this: Storage,
      key,
    ) {
      if (this === browserSession)
        throw new DOMException("Synthetic blocked store", "SecurityError");
      return null;
    });
    const { serverState, recoverableErrors, read } = await hydrateProbe();
    expect(recoverableErrors).toEqual([]);
    expect(clientRenders[0]).toEqual(serverState);
    expect(read().seeded).toBe(true);
    expect(read().storage).toBe("blocked");
  });
});
