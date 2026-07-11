import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireSupabaseServiceRoleClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  requireSupabaseServiceRoleClient: (...args: unknown[]) =>
    requireSupabaseServiceRoleClient(...args),
}));

const loadOwnerWorkflowState = vi.fn();
vi.mock("@/lib/data/workflowServerLoad", () => ({
  loadOwnerWorkflowState: (...args: unknown[]) =>
    loadOwnerWorkflowState(...args),
}));

const sendTelegramBrief = vi.fn();
vi.mock("@/lib/brief/telegram", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brief/telegram")>();
  return {
    ...actual,
    sendTelegramBrief: (...args: unknown[]) => sendTelegramBrief(...args),
  };
});

const { GET } = await import("./route");

const ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "CRON_SECRET",
  "OWNER_USER_ID",
] as const;
type EnvKey = (typeof ENV_KEYS)[number];
const originalEnv: Partial<Record<EnvKey, string | undefined>> = {};

function setEnv(overrides: Partial<Record<EnvKey, string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function getRequest(token?: string) {
  return new Request("http://localhost/api/brief/telegram", {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const configured = {
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_CHAT_ID: "chat-id",
  CRON_SECRET: "cron-secret",
  OWNER_USER_ID: "00000000-0000-4000-8000-000000000099",
};

function emptyWorkflowState() {
  return {
    areas: [],
    captureItems: [],
    taskDrafts: [],
    projectDrafts: [],
    ambiguityAssessments: [],
    timeBlockProposalDrafts: [],
    projects: [],
    tasks: [],
    timeBlockProposals: [],
    calendarBlocks: [],
    executionSessions: [],
    healthChecks: [],
    reviewLog: [],
    wipRefusal: null,
  };
}

describe("GET /api/brief/telegram", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
    requireSupabaseServiceRoleClient.mockReset();
    loadOwnerWorkflowState.mockReset();
    sendTelegramBrief.mockReset();
  });

  afterEach(() => {
    setEnv(originalEnv);
    vi.restoreAllMocks();
  });

  it("responds 204 with no logging when TELEGRAM_BOT_TOKEN is absent (inert gate)", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: "chat-id",
      CRON_SECRET: "cron-secret",
      OWNER_USER_ID: "00000000-0000-4000-8000-000000000099",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(getRequest("cron-secret"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(loadOwnerWorkflowState).not.toHaveBeenCalled();
  });

  it("responds 204 with no logging when TELEGRAM_CHAT_ID is absent (inert gate)", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: undefined,
      CRON_SECRET: "cron-secret",
      OWNER_USER_ID: "00000000-0000-4000-8000-000000000099",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(getRequest("cron-secret"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(loadOwnerWorkflowState).not.toHaveBeenCalled();
  });

  it("responds 204 with no logging when OWNER_USER_ID is absent (inert gate)", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "chat-id",
      CRON_SECRET: "cron-secret",
      OWNER_USER_ID: undefined,
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await GET(getRequest("cron-secret"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(loadOwnerWorkflowState).not.toHaveBeenCalled();
  });

  it("is inert even with a correct CRON_SECRET when all three secrets are absent", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
      CRON_SECRET: "cron-secret",
      OWNER_USER_ID: undefined,
    });

    const response = await GET(getRequest("cron-secret"));

    expect(response.status).toBe(204);
  });

  it("responds 401 when the bearer token does not match CRON_SECRET", async () => {
    setEnv(configured);

    const response = await GET(getRequest("wrong-secret"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "Unauthorized." });
    expect(loadOwnerWorkflowState).not.toHaveBeenCalled();
  });

  it("responds 401 when no Authorization header is sent", async () => {
    setEnv(configured);

    const response = await GET(getRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "Unauthorized." });
  });

  it("responds 401 when CRON_SECRET itself is unset, even with a bearer token present (never an open endpoint)", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "chat-id",
      CRON_SECRET: undefined,
      OWNER_USER_ID: "00000000-0000-4000-8000-000000000099",
    });

    const response = await GET(getRequest("anything"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "Unauthorized." });
  });

  it("composes the exact brief text from the loaded state and sends it with the env chat id, past the gates", async () => {
    setEnv(configured);
    requireSupabaseServiceRoleClient.mockReturnValue({ fakeClient: true });
    loadOwnerWorkflowState.mockResolvedValue({
      ...emptyWorkflowState(),
      areas: [
        {
          id: "area-1",
          user_id: "u1",
          name: "Main Job",
          color: "#2563eb",
          created_at: "2026-07-10T00:00:00.000Z",
        },
      ],
      tasks: [
        {
          id: "task-1",
          user_id: "u1",
          area_id: "area-1",
          project_id: null,
          source_capture_item_id: null,
          title: "Ship the brief route",
          description: null,
          status: "active",
          priority_score: null,
          priority_confidence: null,
          task_type: "task",
          is_reversible: null,
          energy_type: null,
          estimated_minutes_low: null,
          estimated_minutes_high: null,
          due_at: null,
          definition_of_done: null,
          first_tiny_step: null,
          waiting_on_person_id: null,
          waiting_on_since: null,
          is_commitment: false,
          committed_to_person_id: null,
          created_at: "2026-07-10T00:00:00.000Z",
          updated_at: "2026-07-10T00:00:00.000Z",
        },
      ],
      calendarBlocks: [
        {
          id: "block-1",
          user_id: "u1",
          area_id: "area-1",
          proposal_id: null,
          task_id: "task-1",
          google_event_id: null,
          start_at: "2026-07-11T15:00:00.000Z",
          end_at: "2026-07-11T15:30:00.000Z",
          status: "scheduled",
          created_at: "2026-07-10T00:00:00.000Z",
          updated_at: "2026-07-10T00:00:00.000Z",
        },
      ],
    });
    sendTelegramBrief.mockResolvedValue({ ok: true, error: null });

    const now = new Date("2026-07-11T14:00:00.000Z");
    vi.setSystemTime(now);

    const response = await GET(getRequest("cron-secret"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, error: null });

    expect(loadOwnerWorkflowState).toHaveBeenCalledWith(
      { fakeClient: true },
      "00000000-0000-4000-8000-000000000099",
    );
    expect(sendTelegramBrief).toHaveBeenCalledTimes(1);
    const [sentText, sentOptions] = sendTelegramBrief.mock.calls[0] as [
      string,
      { botToken: string; chatId: string },
    ];
    expect(sentOptions).toEqual({
      botToken: "bot-token",
      chatId: "chat-id",
    });
    expect(sentText).toContain("Ship the brief route");
    expect(sentText.split("\n")[0]?.length).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("responds 200 ok:false when the send fails, and never throws", async () => {
    setEnv(configured);
    requireSupabaseServiceRoleClient.mockReturnValue({ fakeClient: true });
    loadOwnerWorkflowState.mockResolvedValue(emptyWorkflowState());
    sendTelegramBrief.mockResolvedValue({
      ok: false,
      error: "Telegram sendMessage failed with status 500",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(getRequest("cron-secret"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(typeof json.error).toBe("string");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("responds 200 ok:false when the persisted-state read fails, and never throws", async () => {
    setEnv(configured);
    requireSupabaseServiceRoleClient.mockReturnValue({ fakeClient: true });
    loadOwnerWorkflowState.mockRejectedValue(new Error("Supabase down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(getRequest("cron-secret"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(typeof json.error).toBe("string");
    expect(errorSpy).toHaveBeenCalled();
    expect(sendTelegramBrief).not.toHaveBeenCalled();
  });
});
