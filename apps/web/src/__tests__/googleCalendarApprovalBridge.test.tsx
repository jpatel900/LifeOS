import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "../app/calendar/page";
import { WorkflowProvider } from "@/lib/WorkflowContext";
import {
  acceptDraft,
  applyGoogleCalendarWriteResult,
  createInitialWorkflowState,
  submitCapture,
  type WorkflowState,
} from "@/lib/workflow";

const STORAGE_KEY = "lifeos.phase2.workflow";
const PROPOSAL_UUID = "3f2c8a34-9b1e-4c5d-8e2f-1a2b3c4d5e6f";
const BLOCK_UUID = "9d8c7b6a-5f4e-4d3c-9b2a-0f1e2d3c4b5a";
const GOOGLE_EVENT_ID = `lifeos${"a1b2c3d4".repeat(4)}`;
const TASK_TITLE = "Sponsor recap block";

const mocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: mocks.createSupabaseBrowserClient,
}));

interface FetchCall {
  url: string;
  body: Record<string, unknown> | null;
}

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function connectedResponse() {
  return jsonResponse(200, {
    ok: true,
    configured: true,
    status: "connected",
    connection: null,
    message: "Google Calendar is connected.",
  });
}

function stubFetch(
  handlers: Record<string, (call: FetchCall, index: number) => Response>,
) {
  const calls: FetchCall[] = [];
  const perUrlCounts = new Map<string, number>();

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
      const call: FetchCall = { url, body };
      calls.push(call);

      const key = Object.keys(handlers).find((candidate) =>
        url.includes(candidate),
      );
      if (!key) {
        return jsonResponse(404, { ok: false, error: `No handler for ${url}` });
      }

      const index = perUrlCounts.get(key) ?? 0;
      perUrlCounts.set(key, index + 1);
      return handlers[key](call, index);
    }),
  );

  return calls;
}

function stateWithSyncedProposal(): WorkflowState {
  let state = createInitialWorkflowState();
  state = submitCapture(state, {
    rawText: TASK_TITLE,
    areaId: "area-main-job",
  });
  state = acceptDraft(state, state.taskDrafts[0].id);
  // Simulate account-synced rows: persisted proposals arrive with UUID ids.
  return {
    ...state,
    timeBlockProposals: state.timeBlockProposals.map((proposal) => ({
      ...proposal,
      id: PROPOSAL_UUID,
    })),
  };
}

function stateWithGoogleScheduledBlock(
  eventId: string = GOOGLE_EVENT_ID,
): WorkflowState {
  let state = stateWithSyncedProposal();
  state = applyGoogleCalendarWriteResult(state, PROPOSAL_UUID, eventId);
  return {
    ...state,
    calendarBlocks: state.calendarBlocks.map((block) =>
      block.proposal_id === PROPOSAL_UUID
        ? { ...block, id: BLOCK_UUID }
        : block,
    ),
  };
}

function renderPlanStage(state: WorkflowState) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return render(
    <WorkflowProvider>
      <CalendarPage />
    </WorkflowProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/calendar");

  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "supabase-access-token" } },
    error: null,
  });
  mocks.createSupabaseBrowserClient.mockReturnValue({
    auth: { getSession: mocks.getSession },
  });
});

describe("Google Calendar approval bridge", () => {
  it("disables the approve button with a plain-language reason when Google is not configured", async () => {
    stubFetch({
      "/api/google-calendar/connection": () =>
        jsonResponse(200, {
          ok: true,
          configured: false,
          status: "disconnected",
          message: "Google Calendar is not configured on this server.",
        }),
    });

    renderPlanStage(stateWithSyncedProposal());

    const approveButton = await screen.findByRole("button", {
      name: `Approve Google event for ${TASK_TITLE}`,
    });
    await waitFor(() => {
      expect(approveButton).toBeDisabled();
    });
    expect(
      screen.getByText(
        "Google Calendar is not configured on this server. Local planning keeps working.",
      ),
    ).toBeDefined();
  });

  it("keeps the bridge disabled in local-only mode without a Supabase client", async () => {
    mocks.createSupabaseBrowserClient.mockReturnValue(null);
    stubFetch({});

    renderPlanStage(stateWithSyncedProposal());

    const approveButton = await screen.findByRole("button", {
      name: `Approve Google event for ${TASK_TITLE}`,
    });
    await waitFor(() => {
      expect(approveButton).toBeDisabled();
    });
    expect(
      screen.getByText(
        "Google Calendar is unavailable in local-only mode. Local planning keeps working.",
      ),
    ).toBeDefined();
  });

  it("creates the Google event from an explicit approval and surfaces the cancel control", async () => {
    const calls = stubFetch({
      "/api/google-calendar/connection": connectedResponse,
      "/api/google-calendar/create-event": () =>
        jsonResponse(200, {
          ok: true,
          google_event_id: GOOGLE_EVENT_ID,
          block: { id: BLOCK_UUID },
          proposal: { id: PROPOSAL_UUID },
        }),
    });

    renderPlanStage(stateWithSyncedProposal());

    const approveButton = await screen.findByRole("button", {
      name: `Approve Google event for ${TASK_TITLE}`,
    });
    await waitFor(() => {
      expect(approveButton).toBeEnabled();
    });
    fireEvent.click(approveButton);

    expect(
      await screen.findByText(
        "Google Calendar event created from your approved proposal.",
      ),
    ).toBeDefined();

    const writeCall = calls.find((call) =>
      call.url.includes("/api/google-calendar/create-event"),
    );
    expect(writeCall?.body).toMatchObject({
      proposal_id: PROPOSAL_UUID,
      approved: true,
      acknowledge_first_write_warning: false,
    });

    expect(
      await screen.findByRole("button", {
        name: `Cancel Google event for ${TASK_TITLE}`,
      }),
    ).toBeDefined();
  });

  it("walks through the first-write warning acknowledgement before creating the event", async () => {
    const calls = stubFetch({
      "/api/google-calendar/connection": connectedResponse,
      "/api/google-calendar/create-event": (_call, index) =>
        index === 0
          ? jsonResponse(428, {
              ok: false,
              error:
                "Acknowledge the first Google Calendar write warning before creating the first event.",
              first_write_warning_required: true,
            })
          : jsonResponse(200, {
              ok: true,
              google_event_id: GOOGLE_EVENT_ID,
              block: { id: BLOCK_UUID },
              proposal: { id: PROPOSAL_UUID },
            }),
    });

    renderPlanStage(stateWithSyncedProposal());

    const approveButton = await screen.findByRole("button", {
      name: `Approve Google event for ${TASK_TITLE}`,
    });
    await waitFor(() => {
      expect(approveButton).toBeEnabled();
    });
    fireEvent.click(approveButton);

    const acknowledgeButton = await screen.findByRole("button", {
      name: "Acknowledge and create Google event",
    });
    expect(
      screen.getByText(
        "Acknowledge the first Google Calendar write warning before creating the first event.",
      ),
    ).toBeDefined();

    fireEvent.click(acknowledgeButton);

    expect(
      await screen.findByText(
        "Google Calendar event created from your approved proposal.",
      ),
    ).toBeDefined();

    const writeCalls = calls.filter((call) =>
      call.url.includes("/api/google-calendar/create-event"),
    );
    expect(writeCalls).toHaveLength(2);
    expect(writeCalls[0].body?.acknowledge_first_write_warning).toBe(false);
    expect(writeCalls[1].body?.acknowledge_first_write_warning).toBe(true);
  });

  it("shows the drift message and keeps the block unchanged on a 409 cancel response", async () => {
    const driftMessage =
      "This Google Calendar event does not carry a matching LifeOS provenance marker. Cancel was aborted.";
    const calls = stubFetch({
      "/api/google-calendar/connection": connectedResponse,
      "/api/google-calendar/cancel-event": () =>
        jsonResponse(409, { ok: false, error: driftMessage }),
    });

    renderPlanStage(stateWithGoogleScheduledBlock());

    const cancelButton = await screen.findByRole("button", {
      name: `Cancel Google event for ${TASK_TITLE}`,
    });
    await waitFor(() => {
      expect(cancelButton).toBeEnabled();
    });
    fireEvent.click(cancelButton);

    expect(await screen.findByText(driftMessage)).toBeDefined();

    const cancelCall = calls.find((call) =>
      call.url.includes("/api/google-calendar/cancel-event"),
    );
    expect(cancelCall?.body).toMatchObject({
      calendar_block_id: BLOCK_UUID,
      approved: true,
    });
    // The block stays scheduled locally, so the cancel control remains.
    expect(
      screen.getByRole("button", {
        name: `Cancel Google event for ${TASK_TITLE}`,
      }),
    ).toBeDefined();
  });

  it("cancels a LifeOS-owned block and releases the task locally", async () => {
    stubFetch({
      "/api/google-calendar/connection": connectedResponse,
      "/api/google-calendar/cancel-event": () =>
        jsonResponse(200, {
          ok: true,
          block: { id: BLOCK_UUID },
          event_already_gone: false,
        }),
    });

    renderPlanStage(stateWithGoogleScheduledBlock());

    const cancelButton = await screen.findByRole("button", {
      name: `Cancel Google event for ${TASK_TITLE}`,
    });
    await waitFor(() => {
      expect(cancelButton).toBeEnabled();
    });
    fireEvent.click(cancelButton);

    expect(
      await screen.findByText(
        "Google Calendar event cancelled. The task is back in the plannable pool.",
      ),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", {
        name: `Cancel Google event for ${TASK_TITLE}`,
      }),
    ).toBeNull();
  });

  it("offers no cancel control for events LifeOS does not own", async () => {
    stubFetch({
      "/api/google-calendar/connection": connectedResponse,
    });

    renderPlanStage(stateWithGoogleScheduledBlock("external-event-id-123"));

    expect(await screen.findByTestId("google-approval-bridge")).toBeDefined();
    expect(
      screen.queryByRole("button", {
        name: `Cancel Google event for ${TASK_TITLE}`,
      }),
    ).toBeNull();
  });
});
