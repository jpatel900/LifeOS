import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import TriagePage from "../app/triage/page";
import { useWorkflow, WorkflowProvider } from "@/lib/WorkflowContext";
import { createInitialWorkflowState } from "@/lib/workflow";

// #687: the demoted stage pages (/capture, /triage, /execute, ...) are
// redirect shims into the moments home under the shipping config. This suite
// exercises the cockpit surfaces themselves, which render only under the
// #590 rollback (NEXT_PUBLIC_MOMENTS_HOME=false) — pin that config here.
const ORIGINAL_MOMENTS_HOME = process.env.NEXT_PUBLIC_MOMENTS_HOME;
beforeEach(() => {
  // beforeEach, not beforeAll: process.env is process-global and shared by
  // every test file in a vitest worker, so re-pin before each test rather
  // than once per file.
  process.env.NEXT_PUBLIC_MOMENTS_HOME = "false";
});
afterAll(() => {
  if (ORIGINAL_MOMENTS_HOME === undefined) {
    delete process.env.NEXT_PUBLIC_MOMENTS_HOME;
  } else {
    process.env.NEXT_PUBLIC_MOMENTS_HOME = ORIGINAL_MOMENTS_HOME;
  }
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/triage",
  useRouter: () => ({ push: vi.fn() }),
}));

const originalSessionStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "sessionStorage",
);

function replaceSessionStorage(overrides: Partial<Storage>) {
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: {
      length: 0,
      clear: vi.fn(),
      getItem: vi.fn(() => null),
      key: vi.fn(() => null),
      removeItem: vi.fn(),
      setItem: vi.fn(),
      ...overrides,
    },
  });
}

function WorkflowProbe() {
  const { state, submitCaptureText, syncStatus } = useWorkflow();

  return (
    <div>
      <span data-testid="capture-count">{state.captureItems.length}</span>
      <span data-testid="storage-status">{syncStatus.storage}</span>
      <span data-testid="account-status">{syncStatus.account}</span>
      <button
        type="button"
        onClick={() =>
          submitCaptureText("Follow up with Alex", "area-main-job")
        }
      >
        Add capture
      </button>
    </div>
  );
}

function HydrationProbe() {
  const { state } = useWorkflow();
  const firstRenderCaptureCount = useRef<number | null>(null);

  if (firstRenderCaptureCount.current === null) {
    firstRenderCaptureCount.current = state.captureItems.length;
  }

  return (
    <div>
      <span data-testid="first-render-capture-count">
        {firstRenderCaptureCount.current}
      </span>
      <span data-testid="capture-count">{state.captureItems.length}</span>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalSessionStorageDescriptor) {
    Object.defineProperty(
      window,
      "sessionStorage",
      originalSessionStorageDescriptor,
    );
  }
});

describe("WorkflowProvider storage fallback", () => {
  // This suite exercises the UNCONFIGURED (local/storage) mode. Ambient
  // Supabase env must not flip the provider into account mode: the
  // Migrations + RLS CI lane exports a live local stack, which made these
  // tests report sync-error instead of local-only while the default lane
  // passed vacuously. See docs/FAILURES.md (env-blind validation).
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });
  it("falls back to initial state when sessionStorage cannot be read", async () => {
    replaceSessionStorage({
      getItem: vi.fn(() => {
        throw new DOMException("Storage is blocked.", "SecurityError");
      }),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("capture-count")).toHaveTextContent("0");
    await waitFor(() => {
      expect(screen.getByTestId("storage-status")).toHaveTextContent("blocked");
    });
  });

  it("falls back to initial state when stored workflow state has an invalid shape", () => {
    replaceSessionStorage({
      getItem: vi.fn(() =>
        JSON.stringify({
          captureItems: [],
          taskDrafts: [],
          ambiguityAssessments: [],
          timeBlockProposalDrafts: [],
          tasks: [],
          timeBlockProposals: [],
          calendarBlocks: [],
          executionSessions: [],
          healthChecks: [],
          reviewLog: [],
        }),
      ),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("capture-count")).toHaveTextContent("0");
  });

  it("falls back to initial state when stored workflow items are malformed", async () => {
    const invalidState = {
      ...createInitialWorkflowState(),
      taskDrafts: [
        {
          id: "task-draft-1",
          user_id: "user-1",
          capture_item_id: "capture-1",
          area_id: "area-main-job",
          title: "Review sponsor notes",
          description: "Draft created from capture.",
          confidence: 0.8,
          estimated_minutes_low: 15,
          estimated_minutes_high: 30,
          first_tiny_step: "Open the notes",
          status: "pending",
          created_at: "2026-05-08T14:00:00.000Z",
        },
      ],
      ambiguityAssessments: [
        {
          id: "ambiguity-1",
          user_id: "user-1",
          area_id: "area-main-job",
          source_capture_item_id: "capture-1",
          likely_objective: "Review sponsor notes",
          possible_workstreams: ["Clarify"],
          knowns: ["There are notes."],
          unknowns: "not-an-array",
          assumptions: ["This needs triage."],
          constraints: ["Keep it local."],
          risks: ["Could schedule too early."],
          dependencies: ["User review."],
          recommended_first_move: "Open the notes",
          what_not_to_do_yet: ["Do not schedule yet."],
          confidence_score: 0.7,
          review_trigger: "Review in triage.",
          created_at: "2026-05-08T14:00:00.000Z",
        },
      ],
    };
    replaceSessionStorage({
      getItem: vi.fn(() => JSON.stringify(invalidState)),
    });

    render(
      <WorkflowProvider>
        <TriagePage />
      </WorkflowProvider>,
    );

    expect(await screen.findByText("Inbox clear")).toBeDefined();
  });

  it("keeps the workflow usable when sessionStorage cannot be written", async () => {
    replaceSessionStorage({
      setItem: vi.fn(() => {
        throw new DOMException("Storage quota exceeded.", "QuotaExceededError");
      }),
    });

    render(
      <WorkflowProvider>
        <WorkflowProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add capture" }));

    expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    await waitFor(() => {
      expect(screen.getByTestId("storage-status")).toHaveTextContent("blocked");
    });
  });

  it("hydrates persisted workflow state after the first render", async () => {
    const storedState = {
      ...createInitialWorkflowState(),
      captureItems: [
        {
          id: "capture-9",
          user_id: "user-1",
          area_id: "area-main-job",
          raw_text: "Persisted capture from previous session",
          raw_audio_ref: null,
          capture_mode: "text",
          inferred_area_confidence: null,
          status: "triage_required",
          created_at: "2026-05-08T14:00:00.000Z",
        },
      ],
    };

    replaceSessionStorage({
      getItem: vi.fn(() => JSON.stringify(storedState)),
    });

    render(
      <WorkflowProvider>
        <HydrationProbe />
      </WorkflowProvider>,
    );

    expect(screen.getByTestId("first-render-capture-count")).toHaveTextContent(
      "0",
    );

    await waitFor(() => {
      expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    });
  });
  it("parses a raw-saved capture through the route before adding triage drafts", async () => {
    replaceSessionStorage({});

    let resolveParse!: (response: Response) => void;
    const parseResponse = new Promise<Response>((resolve) => {
      resolveParse = resolve;
    });
    const fetchMock = vi.fn(() => parseResponse);
    vi.stubGlobal("fetch", fetchMock);

    const successfulResponse = {
      ok: true,
      json: async () => ({
        ok: true,
        parser: "ai",
        status: "ai_available",
        response: {
          schema_version: "1.0",
          prompt_version: "parse-capture-v1",
          parse_status: "parsed",
          overall_confidence: 0.86,
          triage_required: true,
          triage_reasons: ["Review before committing."],
          drafts: [
            {
              draft_type: "task_draft",
              title: "Follow up with Alex",
              description: "Send Alex the follow-up note.",
              area_slug_suggestion: "main-job",
              first_tiny_step: "Open the thread with Alex.",
              estimated_minutes_low: 15,
              estimated_minutes_high: 30,
              due_at: null,
              confidence: 0.82,
            },
          ],
          clarification_questions: [],
          ambiguity_assessment: null,
        },
      }),
    } as Response;

    function ParseProbe() {
      const { state, submitCaptureText, sortCaptureIntoDrafts } = useWorkflow();
      return (
        <div>
          <span data-testid="capture-count">{state.captureItems.length}</span>
          <span data-testid="draft-count">{state.taskDrafts.length}</span>
          <span data-testid="first-capture-status">
            {state.captureItems[0]?.status ?? ""}
          </span>
          <span data-testid="first-draft-title">
            {state.taskDrafts[0]?.title ?? ""}
          </span>
          <button
            type="button"
            onClick={() =>
              submitCaptureText("Follow up with Alex", "area-main-job")
            }
          >
            Add capture
          </button>
          <button
            type="button"
            onClick={() => {
              const capture = state.captureItems[0];
              if (capture) sortCaptureIntoDrafts(capture.id);
            }}
          >
            Sort
          </button>
        </div>
      );
    }

    render(
      <WorkflowProvider>
        <ParseProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add capture" }));

    // #703: capture alone never parses — the route is only called once the
    // person sorts the stored capture in triage.
    await waitFor(() => {
      expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
      expect(screen.getByTestId("draft-count")).toHaveTextContent("0");
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sort" }));

    await act(async () => {
      resolveParse(successfulResponse);
      await parseResponse;
    });

    await waitFor(() => {
      expect(screen.getByTestId("draft-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    expect(screen.getByTestId("first-capture-status")).toHaveTextContent(
      "triage_required",
    );
    expect(screen.getByTestId("first-draft-title")).toHaveTextContent(
      "Follow up with Alex",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/parse-capture",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("stages a second raw capture while the first capture is still parsing", async () => {
    replaceSessionStorage({});

    let resolveParse!: (response: Response) => void;
    const parseResponse = new Promise<Response>((resolve) => {
      resolveParse = resolve;
    });
    const fetchMock = vi.fn(() => parseResponse);
    vi.stubGlobal("fetch", fetchMock);

    function ConcurrentCaptureProbe() {
      const { captureParse, state, submitCaptureText, sortCaptureIntoDrafts } =
        useWorkflow();
      return (
        <div>
          <span data-testid="capture-count">{state.captureItems.length}</span>
          <span data-testid="capture-texts">
            {state.captureItems.map((capture) => capture.raw_text).join("|")}
          </span>
          <span data-testid="parse-phase">{captureParse.phase}</span>
          <button
            type="button"
            onClick={() => submitCaptureText("First capture", "area-main-job")}
          >
            Add first capture
          </button>
          <button
            type="button"
            onClick={() => submitCaptureText("Second capture", "area-main-job")}
          >
            Add second capture
          </button>
          <button
            type="button"
            onClick={() => {
              const capture = state.captureItems[0];
              if (capture) sortCaptureIntoDrafts(capture.id);
            }}
          >
            Sort
          </button>
        </div>
      );
    }

    render(
      <WorkflowProvider>
        <ConcurrentCaptureProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add first capture" }));
    await waitFor(() => {
      expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort" }));
    await waitFor(() => {
      expect(screen.getByTestId("parse-phase")).toHaveTextContent("parsing");
    });

    // #703: a sort in flight must NEVER block writing down a new thought —
    // capture and sorting are different surfaces now.
    fireEvent.click(screen.getByRole("button", { name: "Add second capture" }));

    expect(screen.getByTestId("capture-count")).toHaveTextContent("2");
    expect(screen.getByTestId("capture-texts")).toHaveTextContent(
      "First capture",
    );
    expect(screen.getByTestId("capture-texts")).toHaveTextContent(
      "Second capture",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveParse({
        ok: false,
        json: async () => ({
          ok: false,
          error: "Parsing failed safely.",
          can_retry_with_mock: true,
          status: "ai_available",
        }),
      } as Response);
      await parseResponse;
    });
  });

  it("submitCaptureText stages the capture but never parses it (#703)", async () => {
    replaceSessionStorage({});

    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => ({}) }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    function RawProbe() {
      const { state, submitCaptureText } = useWorkflow();
      return (
        <div>
          <span data-testid="capture-count">{state.captureItems.length}</span>
          <span data-testid="draft-count">{state.taskDrafts.length}</span>
          <button
            type="button"
            onClick={() => submitCaptureText("Buy milk", "area-main-job")}
          >
            Capture
          </button>
        </div>
      );
    }

    render(
      <WorkflowProvider>
        <RawProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture" }));

    // The raw capture is staged immediately...
    await waitFor(() => {
      expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    });
    // ...but it is never parsed: no draft appears and the parse route is
    // never called. #703: this is now true of EVERY capture — sorting is a
    // separate, explicit triage action (`sortCaptureIntoDrafts`).
    expect(screen.getByTestId("draft-count")).toHaveTextContent("0");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/parse-capture",
      expect.anything(),
    );
  });

  it("keeps raw capture visible without drafts when parsing fails", async () => {
    replaceSessionStorage({});

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            json: async () => ({
              ok: false,
              error:
                "Parsing failed safely. You can retry with the mock parser.",
              can_retry_with_mock: true,
              status: "ai_available",
            }),
          }) as Response,
      ),
    );

    function FailureProbe() {
      const {
        state,
        submitCaptureText,
        sortCaptureIntoDrafts,
        syncStatus,
        captureParse,
      } = useWorkflow();
      return (
        <div>
          <span data-testid="capture-count">{state.captureItems.length}</span>
          <span data-testid="draft-count">{state.taskDrafts.length}</span>
          <span data-testid="account-status">{syncStatus.account}</span>
          <span data-testid="parse-phase">{captureParse.phase}</span>
          <span data-testid="parse-message">
            {captureParse.phase === "failed" ? captureParse.message : ""}
          </span>
          <span data-testid="first-capture-status">
            {state.captureItems[0]?.status ?? ""}
          </span>
          <button
            type="button"
            onClick={() =>
              submitCaptureText("Follow up with Alex", "area-main-job")
            }
          >
            Add capture
          </button>
          <button
            type="button"
            onClick={() => {
              const capture = state.captureItems[0];
              if (capture) sortCaptureIntoDrafts(capture.id);
            }}
          >
            Sort
          </button>
        </div>
      );
    }

    render(
      <WorkflowProvider>
        <FailureProbe />
      </WorkflowProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add capture" }));

    await waitFor(() => {
      expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
      expect(screen.getByTestId("draft-count")).toHaveTextContent("0");
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort" }));

    await waitFor(() => {
      expect(screen.getByTestId("account-status")).toHaveTextContent(
        "local-only",
      );
    });
    expect(screen.getByTestId("capture-count")).toHaveTextContent("1");
    expect(screen.getByTestId("draft-count")).toHaveTextContent("0");
    expect(screen.getByTestId("first-capture-status")).toHaveTextContent("new");
    await waitFor(() => {
      expect(screen.getByTestId("parse-phase")).toHaveTextContent("failed");
    });
    expect(screen.getByTestId("parse-message")).toHaveTextContent(
      "Parsing failed safely",
    );
  });
});

// #688: signed-out is recognized as a calm state, never conflated with a
// real load failure.
describe("isSignedOutError (#688)", () => {
  it("matches the data layer's signed-out errors and supabase's missing-session error", async () => {
    const { isSignedOutError } =
      await import("@/lib/workflowContext/reducerCore");
    expect(
      isSignedOutError(
        new Error("Sign in before loading areas from Supabase."),
      ),
    ).toBe(true);
    expect(isSignedOutError(new Error("Auth session missing!"))).toBe(true);
  });

  it("does not match real failures with a live session", async () => {
    const { isSignedOutError } =
      await import("@/lib/workflowContext/reducerCore");
    expect(isSignedOutError(new Error("JWT expired"))).toBe(false);
    expect(isSignedOutError(new Error("network error"))).toBe(false);
    expect(isSignedOutError("Sign in before loading")).toBe(false);
  });
});
