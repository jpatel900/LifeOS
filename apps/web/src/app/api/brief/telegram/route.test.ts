import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "CRON_SECRET",
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

function postRequest(token?: string) {
  return new Request("http://localhost/api/brief/telegram", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

const configured = {
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_CHAT_ID: "chat-id",
  CRON_SECRET: "cron-secret",
};

describe("POST /api/brief/telegram", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
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
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(postRequest("cron-secret"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("responds 204 with no logging when TELEGRAM_CHAT_ID is absent (inert gate)", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: undefined,
      CRON_SECRET: "cron-secret",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(postRequest("cron-secret"));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("is inert even with a correct CRON_SECRET when both Telegram secrets are absent", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
      CRON_SECRET: "cron-secret",
    });

    const response = await POST(postRequest("cron-secret"));

    expect(response.status).toBe(204);
  });

  it("responds 401 when the bearer token does not match CRON_SECRET", async () => {
    setEnv(configured);

    const response = await POST(postRequest("wrong-secret"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "Unauthorized." });
  });

  it("responds 401 when no Authorization header is sent", async () => {
    setEnv(configured);

    const response = await POST(postRequest());
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "Unauthorized." });
  });

  it("responds 401 when CRON_SECRET itself is unset, even with a bearer token present (never an open endpoint)", async () => {
    setEnv({
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_CHAT_ID: "chat-id",
      CRON_SECRET: undefined,
    });

    const response = await POST(postRequest("anything"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "Unauthorized." });
  });

  it("responds 200 ok:false past the gates while owner resolution is unimplemented (OWNER-GATE), and never throws", async () => {
    setEnv(configured);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postRequest("cron-secret"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(typeof json.error).toBe("string");
    expect(errorSpy).toHaveBeenCalled();
  });
});
