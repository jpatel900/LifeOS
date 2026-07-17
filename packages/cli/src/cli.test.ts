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

describe("lifeos areas + today (#642)", () => {
  it("areas list calls /api/v1/areas with the bearer token, active-only by default", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, api_version: "1", data: { areas: [] } }),
    );
    const { io } = makeIo();

    const outcome = await runCli(["areas", "list"], io, config);

    expect(outcome.exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/v1/areas");
    expect(init.headers.authorization).toBe("Bearer user-token");
  });

  it("areas list --include-inactive widens the read", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, data: { areas: [] } }),
    );
    const { io } = makeIo();

    await runCli(["areas", "list", "--include-inactive"], io, config);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:3000/api/v1/areas?include_inactive=1",
    );
  });

  it("today computes the LOCAL day window client-side and passes it as the required query", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, data: { blocks: [], tasks: [] } }),
    );
    const { io } = makeIo();

    const outcome = await runCli(["today", "--date", "2026-07-17"], io, config);

    expect(outcome.exitCode).toBe(0);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/blocks");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    // Day authority is client-side: the window is the LOCAL 2026-07-17
    // midnight-to-midnight converted to ISO instants, exactly 24h apart.
    expect(start).toBe(new Date(2026, 6, 17).toISOString());
    expect(end).toBe(new Date(2026, 6, 18).toISOString());
    expect(Date.parse(end!) - Date.parse(start!)).toBe(24 * 60 * 60 * 1000);
  });

  it("today rejects a malformed --date before any network or auth work", async () => {
    const { lines, io } = makeIo();

    for (const bad of ["2026-7-17", "17-07-2026", "2026-02-30", "tomorrow"]) {
      const outcome = await runCli(["today", "--date", bad], io, config);
      expect(outcome.exitCode).toBe(1);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
    expect(JSON.parse(lines[0]).ok).toBe(false);
  });
});

describe("lifeos capture --parse (#641)", () => {
  const captureOkBody = {
    ok: true,
    api_version: "1",
    data: { capture: { id: "c1", status: "new" } },
  };

  it("saves the capture FIRST, then parses; envelope carries both results", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, captureOkBody))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          data: { areas: [{ slug: "work", name: "Work" }] },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          ok: true,
          parser: "mock",
          response: { summary: "draft" },
        }),
      );
    const { lines, io } = makeIo();

    const outcome = await runCli(
      ["capture", "note", "--parse", "--parser", "mock"],
      io,
      config,
    );

    expect(outcome.exitCode).toBe(0);
    const calls = fetchMock.mock.calls.map((call) => new URL(call[0]).pathname);
    // Ordering IS the raw-save-first invariant: captures before parse.
    expect(calls).toEqual([
      "/api/v1/captures",
      "/api/v1/areas",
      "/api/parse-capture",
    ]);
    const parsePayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(parsePayload.parserMode).toBe("mock");
    expect(parsePayload.areaContext).toEqual([{ slug: "work", name: "Work" }]);
    expect(parsePayload.rawText).toBe("note");

    const envelope = JSON.parse(lines[0]);
    expect(envelope.ok).toBe(true);
    expect(envelope.capture.data.capture.id).toBe("c1");
    expect(envelope.parse.parser).toBe("mock");
  });

  it("NEVER parses when the capture save failed; exits 1", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { ok: false, error: "save failed" }),
    );
    const { lines, io } = makeIo();

    const outcome = await runCli(["capture", "note", "--parse"], io, config);

    expect(outcome.exitCode).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe(
      "/api/v1/captures",
    );
    expect(JSON.parse(lines[0]).parse).toBeNull();
  });

  it("a parse failure leaves the saved capture as the outcome: exit 0, parse error inside", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, captureOkBody))
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, data: { areas: [] } }),
      )
      .mockRejectedValueOnce(new Error("network down"));
    const { lines, io } = makeIo();

    const outcome = await runCli(["capture", "note", "--parse"], io, config);

    expect(outcome.exitCode).toBe(0);
    const envelope = JSON.parse(lines[0]);
    expect(envelope.ok).toBe(true);
    expect(envelope.capture.data.capture.id).toBe("c1");
    expect(envelope.parse.ok).toBe(false);
  });

  it("an areas-read failure is silent enrichment loss: parse still runs without context", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, captureOkBody))
      .mockRejectedValueOnce(new Error("areas unavailable"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, parser: "mock" }));
    const { lines, io } = makeIo();

    const outcome = await runCli(["capture", "note", "--parse"], io, config);

    expect(outcome.exitCode).toBe(0);
    const parsePayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(parsePayload.areaContext).toBeUndefined();
    expect(JSON.parse(lines[0]).parse.ok).toBe(true);
  });

  it("rejects an invalid --parser value before any network work", async () => {
    const { lines, io } = makeIo();
    const outcome = await runCli(
      ["capture", "note", "--parse", "--parser", "gpt"],
      io,
      config,
    );
    expect(outcome.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(lines[0]).ok).toBe(false);
  });

  it("without --parse the behavior is unchanged: one request, api envelope verbatim", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, captureOkBody));
    const { io } = makeIo();

    const outcome = await runCli(["capture", "note"], io, config);

    expect(outcome.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
