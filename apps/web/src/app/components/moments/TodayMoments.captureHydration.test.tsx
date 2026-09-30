import "fake-indexeddb/auto";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowProvider, useWorkflow } from "@/lib/WorkflowContext";
import {
  clearPendingWrites,
  listPendingWrites,
} from "@/lib/durability/pendingWriteJournal";
import {
  journalCaptureWrite,
  replayDurableWrites,
} from "@/lib/durability/durableWrites";
import { TodayMoments } from "./TodayMoments";
import {
  FIXED_NOW,
  pressCaptureShortcut,
  resetTodayMomentsMountTracking,
} from "@/__tests__/helpers/todayMomentsHarness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));
vi.mock("@/lib/reEntry/briefView", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reEntry/briefView")>()),
  createBriefViewRecorder: () => ({ recordIfNeeded: vi.fn() }),
}));

const { listAreas, listCaptures, upsert, account } = vi.hoisted(() => ({
  listAreas: vi.fn(),
  listCaptures: vi.fn(),
  upsert: vi.fn(),
  account: { available: false, captures: [] as Record<string, unknown>[] },
}));

vi.mock("@/lib/supabase/browser", () => {
  const client = {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getUser: async () => ({
        data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
        error: null,
      }),
    },
    from: () => ({ upsert }),
  };
  return { createSupabaseBrowserClient: () => client };
});
vi.mock("@/lib/data/workflow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/workflow")>()),
  listAreas,
  listCaptureItems: listCaptures,
  listPlanningItems: async () => ({
    provider: "supabase",
    tasks: [],
    proposals: [],
    blocks: [],
  }),
  listExecutionReviewItems: async () => ({
    provider: "supabase",
    tasks: [],
    blocks: [],
    sessions: [],
    reviewEntries: [],
  }),
  listWinRecords: async () => ({ provider: "supabase", winRecords: [] }),
  listOverrideRecords: async () => ({
    provider: "supabase",
    overrideRecords: [],
  }),
  listDurationProfiles: async () => ({
    provider: "supabase",
    durationProfiles: [],
  }),
  listSuggestionRecords: async () => ({
    provider: "supabase",
    suggestionRecords: [],
  }),
  listRollupSummaries: async () => ({
    provider: "supabase",
    rollupSummaries: [],
  }),
}));

const customArea = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Synthetic lab",
  slug: "synthetic-lab",
  description: null,
  color: null,
  icon: null,
  sort_order: 0,
  is_active: true,
  created_at: "2026-07-05T00:00:00.000Z",
  updated_at: "2026-07-05T00:00:00.000Z",
};

function Probe() {
  const {
    state,
    workflowAreaIdByPersistedId,
    syncStatus,
    refreshPersistedWorkflow,
    retryPendingAccountWrites,
  } = useWorkflow();
  return (
    <>
      <output data-testid="capture-provider-state">
        {JSON.stringify({
          areas: state.areas,
          captures: state.captureItems,
          aliases: state.accountIdByLocalId.captures,
          map: workflowAreaIdByPersistedId,
          syncStatus,
        })}
      </output>
      <button onClick={() => void refreshPersistedWorkflow()}>
        Refresh account
      </button>
      <button onClick={() => void retryPendingAccountWrites()}>
        Retry account
      </button>
    </>
  );
}
function providerState() {
  return JSON.parse(
    screen.getByTestId("capture-provider-state").textContent!,
  ) as {
    areas: { id: string }[];
    captures: { id: string; area_id: string | null; raw_text: string }[];
    aliases: Record<string, string>;
    map: Record<string, string>;
    syncStatus: { account: string; message: string | null };
  };
}
function mountToday() {
  return render(
    <WorkflowProvider>
      <Probe />
      <TodayMoments now={FIXED_NOW} initialMoment="start" />
    </WorkflowProvider>,
  );
}
function save(text: string) {
  const textarea = screen.getByTestId("capture-overlay-textarea");
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: "Enter" });
}

beforeEach(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-key");
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.cookie = "lifeos_moments_prefs=; Max-Age=0; Path=/";
  resetTodayMomentsMountTracking();
  await clearPendingWrites();
  vi.clearAllMocks();
  account.available = false;
  account.captures = [];
  listCaptures.mockImplementation(async () => ({
    provider: "supabase",
    captures: [...account.captures],
  }));
  listAreas.mockResolvedValue({ provider: "supabase", areas: [customArea] });
  // Keep the real journal, dispatcher and syncJournaledCapture. Only the account
  // transport/readback are synthetic; failed sends cannot clear the journal.
  upsert.mockImplementation((input: Record<string, unknown>) => ({
    select: () => ({
      single: async () => {
        if (!account.available)
          return {
            data: null,
            error: { message: "Synthetic account unavailable" },
          };
        const row = {
          ...input,
          id: "33333333-3333-4333-8333-333333333333",
          raw_audio_ref: null,
          inferred_area_confidence: null,
          status: "new",
          created_at: FIXED_NOW.toISOString(),
        };
        account.captures.push(row);
        return { data: row, error: null };
      },
    }),
  }));
});
afterEach(async () => {
  cleanup();
  await clearPendingWrites();
  vi.unstubAllEnvs();
  resetTodayMomentsMountTracking();
});

describe("Today capture before account area hydration", () => {
  it("journals no implicit demo destination and delivers one account row after custom-only areas arrive", async () => {
    let resolveAreas!: (result: {
      provider: "supabase";
      areas: (typeof customArea)[];
    }) => void;
    listAreas.mockReturnValue(
      new Promise((resolve) => {
        resolveAreas = resolve;
      }),
    );
    mountToday();
    await waitFor(() => expect(listAreas).toHaveBeenCalledTimes(1));
    expect(
      providerState().areas.some((area) => area.id.startsWith("area-")),
    ).toBe(true);
    expect(providerState().map).toEqual({});
    pressCaptureShortcut();
    expect
      .soft(screen.getByTestId("capture-save-destination"))
      .toHaveTextContent("Will save without an area.");
    expect
      .soft(screen.queryByRole("option", { name: "Main Job" }))
      .not.toBeInTheDocument();
    save("Synthetic early thought");
    await waitFor(async () =>
      expect(await listPendingWrites("capture")).toHaveLength(1),
    );
    const pending = (await listPendingWrites("capture"))[0];
    expect.soft(pending.payload.workflow_area_id).toBeNull();
    expect(pending.payload.persisted_area_id).toBeNull();
    await waitFor(() =>
      expect(providerState().syncStatus.account).toBe("local-only"),
    );
    expect(providerState().syncStatus.message).toMatch(/device/i);
    expect(account.captures).toHaveLength(0);
    account.available = true;
    await act(async () =>
      resolveAreas({ provider: "supabase", areas: [customArea] }),
    );
    await waitFor(() => expect(account.captures).toHaveLength(1));
    expect(account.captures[0]).toMatchObject({
      area_id: null,
      raw_text: "Synthetic early thought",
      client_capture_id: pending.client_write_id,
    });
    await waitFor(() =>
      expect(
        providerState().aliases[pending.payload.workflow_capture_id as string],
      ).toBe(account.captures[0].id),
    );
    // Ordered mount replay aliases the row; an explicit read confirms that the
    // local optimistic row converges to that same account row, without a twin.
    fireEvent.click(screen.getByRole("button", { name: "Refresh account" }));
    await waitFor(() =>
      expect(providerState().captures.map((capture) => capture.id)).toEqual([
        account.captures[0].id,
      ]),
    );
    expect(providerState().captures[0].area_id).toBeNull();
    expect(await listPendingWrites("capture")).toEqual([]);
    expect(account.captures).toHaveLength(1);
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("keeps capture unscoped when the account area read fails", async () => {
    listAreas.mockRejectedValue(new Error("Synthetic area read failed"));
    account.available = true;
    mountToday();
    await waitFor(() =>
      expect(providerState().syncStatus.account).toBe("sync-error"),
    );
    expect(providerState().map).toEqual({});
    pressCaptureShortcut();
    expect(screen.getByTestId("capture-save-destination")).toHaveTextContent(
      "Will save without an area.",
    );
    expect(
      screen.queryByRole("combobox", { name: "Save to area (optional)" }),
    ).not.toBeInTheDocument();
    save("Synthetic failed-inventory thought");
    await waitFor(() => expect(account.captures).toHaveLength(1));
    expect(account.captures[0].area_id).toBeNull();
    await waitFor(async () =>
      expect(await listPendingWrites("capture")).toEqual([]),
    );
  });
  it("keeps an explicit no-area choice through another account read", async () => {
    let resolveAreas!: (result: {
      provider: "supabase";
      areas: (typeof customArea)[];
    }) => void;
    listAreas.mockReturnValue(
      new Promise((resolve) => {
        resolveAreas = resolve;
      }),
    );
    mountToday();
    pressCaptureShortcut();
    // Before inventory there is no real picker choice. After inventory, choosing
    // no area must remain explicit through a subsequent account read.
    account.available = true;
    await act(async () =>
      resolveAreas({ provider: "supabase", areas: [customArea] }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Save to area (optional)" }),
      ).toHaveValue(customArea.id),
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Save to area (optional)" }),
      { target: { value: "" } },
    );
    const readsBefore = listCaptures.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Refresh account" }));
    await waitFor(() =>
      expect(listCaptures.mock.calls.length).toBeGreaterThan(readsBefore),
    );
    expect(screen.getByTestId("capture-save-destination")).toHaveTextContent(
      "Will save without an area.",
    );
    save("Synthetic unscoped thought");
    await waitFor(() => expect(account.captures).toHaveLength(1));
    expect(account.captures[0].area_id).toBeNull();
  });

  it("keeps a deliberate real-area capture queued through account failure and sends that area on retry", async () => {
    const chosenArea = {
      ...customArea,
      id: "44444444-4444-4444-8444-444444444444",
      name: "Synthetic second area",
      slug: "synthetic-second-area",
      sort_order: 1,
    };
    listAreas.mockResolvedValue({
      provider: "supabase",
      areas: [customArea, chosenArea],
    });
    mountToday();
    await waitFor(() =>
      expect(providerState().map[chosenArea.id]).toBe(chosenArea.id),
    );
    pressCaptureShortcut();
    expect(
      screen.getByRole("combobox", { name: "Save to area (optional)" }),
    ).toHaveValue(customArea.id);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Save to area (optional)" }),
      { target: { value: chosenArea.id } },
    );
    save("Synthetic chosen-area thought");
    await waitFor(async () =>
      expect(await listPendingWrites("capture")).toHaveLength(1),
    );
    await waitFor(() =>
      expect(providerState().syncStatus.account).toBe("local-only"),
    );
    const pending = (await listPendingWrites("capture"))[0];
    expect(pending.payload).toMatchObject({
      workflow_area_id: chosenArea.id,
      persisted_area_id: chosenArea.id,
    });
    expect(account.captures).toHaveLength(0);
    account.available = true;
    fireEvent.click(screen.getByRole("button", { name: "Retry account" }));
    await waitFor(() => expect(account.captures).toHaveLength(1));
    expect(account.captures[0].area_id).toBe(chosenArea.id);
    await waitFor(async () =>
      expect(await listPendingWrites("capture")).toEqual([]),
    );
  });

  it("retains an unresolved non-null journal destination until its mapping exists", async () => {
    await journalCaptureWrite({
      workflowCaptureId: "capture-synthetic",
      workflowAreaId: "area-real-choice",
      persistedAreaId: null,
      rawText: "Synthetic held choice",
      returnHook: null,
      clientCaptureId: "capture-synthetic",
    });
    const syncCapture = vi.fn(async () => ({
      provider: "supabase" as const,
      captureId: "capture-account",
    }));
    const unresolved = await replayDurableWrites({
      syncCapture,
      resolveCaptureAreaId: () => null,
    });
    expect(unresolved.failed).toBe(1);
    expect(syncCapture).not.toHaveBeenCalled();
    expect(
      (await listPendingWrites("capture"))[0].payload.workflow_area_id,
    ).toBe("area-real-choice");
    await replayDurableWrites({
      syncCapture,
      resolveCaptureAreaId: () => customArea.id,
    });
    expect(syncCapture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ area_id: customArea.id }),
    );
    expect(await listPendingWrites("capture")).toEqual([]);
  });
});
