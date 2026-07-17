import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliConfig } from "./config";
import { runCli, type CliIo } from "./cli";

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  whoami: vi.fn(),
}));

vi.mock("./auth", () => mocks);

const config: CliConfig = {
  apiUrl: "http://localhost:3000",
  supabaseUrl: "http://localhost:54321",
  supabaseAnonKey: "anon",
  sessionFile: "/tmp/lifeos-test-session.json",
};

interface Emitted {
  lines: string[];
  io: CliIo;
}

function makeIo(env: NodeJS.ProcessEnv = {}): Emitted {
  const lines: string[] = [];
  return {
    lines,
    io: { stdout: (line) => lines.push(line), env },
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mocks.getAccessToken.mockResolvedValue("user-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    json: async () => body,
  };
}

describe("lifeos CLI JSON contract", () => {
  it("emits exactly one JSON object on stdout for every command", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, api_version: "1", capabilities: [] }),
    );
    const { lines, io } = makeIo();

    const outcome = await runCli(["capabilities"], io, config);

    expect(outcome.exitCode).toBe(0);
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it("unknown commands produce a usage error envelope with exit 1", async () => {
    const { lines, io } = makeIo();
    const outcome = await runCli(["frobnicate"], io, config);
    expect(outcome.exitCode).toBe(1);
    expect(JSON.parse(lines[0]).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API error envelopes pass through verbatim with exit 1", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { ok: false, error: "Sign in before listing tasks." }),
    );
    const { lines, io } = makeIo();

    const outcome = await runCli(["tasks", "list"], io, config);

    expect(outcome.exitCode).toBe(1);
    expect(JSON.parse(lines[0])).toEqual({
      ok: false,
      error: "Sign in before listing tasks.",
    });
  });
});

describe("transport boundary (ADR 0006)", () => {
  it("tasks list calls the versioned contract with the bearer token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, data: { tasks: [] } }),
    );
    const { io } = makeIo();

    await runCli(["tasks", "list"], io, config);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/tasks",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          authorization: "Bearer user-token",
        }),
      }),
    );
  });

  it("capture posts the raw text verbatim with an idempotency key", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { ok: true, data: { status: "persisted" } }),
    );
    const { io } = makeIo();

    const outcome = await runCli(
      [
        "capture",
        "Call the dentist",
        "--return-hook",
        "the inbox",
        "--client-capture-id",
        "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      ],
      io,
      config,
    );

    expect(outcome.exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/v1/captures");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      raw_text: "Call the dentist",
      return_hook: "the inbox",
      area_id: null,
      client_capture_id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    });
  });

  it("capture generates a UUID idempotency key when none is provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ok: true, data: {} }));
    const { io } = makeIo();

    await runCli(["capture", "hello"], io, config);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.client_capture_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("capture refuses empty text without calling the API", async () => {
    const { lines, io } = makeIo();
    const outcome = await runCli(["capture", "   "], io, config);
    expect(outcome.exitCode).toBe(1);
    expect(JSON.parse(lines[0]).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("data commands fail cleanly when not signed in (no API call)", async () => {
    mocks.getAccessToken.mockRejectedValue(
      new Error("Not signed in. Run: lifeos login --email <email>"),
    );
    const { lines, io } = makeIo();

    const outcome = await runCli(["tasks", "list"], io, config);

    expect(outcome.exitCode).toBe(1);
    expect(JSON.parse(lines[0]).error).toMatch(/not signed in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("auth commands", () => {
  it("login reads the password from the environment, never argv", async () => {
    mocks.login.mockResolvedValue({ email: "j@example.com" });
    const { lines, io } = makeIo({ LIFEOS_PASSWORD: "hunter2" });

    const outcome = await runCli(
      ["login", "--email", "j@example.com"],
      io,
      config,
    );

    expect(outcome.exitCode).toBe(0);
    expect(mocks.login).toHaveBeenCalledWith(
      config,
      "j@example.com",
      "hunter2",
    );
    expect(JSON.parse(lines[0]).data.signed_in).toBe(true);
  });

  it("login fails with a clear error when the password env var is unset", async () => {
    const { lines, io } = makeIo();
    const outcome = await runCli(
      ["login", "--email", "j@example.com"],
      io,
      config,
    );
    expect(outcome.exitCode).toBe(1);
    expect(JSON.parse(lines[0]).error).toContain("LIFEOS_PASSWORD");
    expect(mocks.login).not.toHaveBeenCalled();
  });
});
