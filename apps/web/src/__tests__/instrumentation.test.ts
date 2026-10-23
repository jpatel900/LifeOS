// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("../../langfuse.server.config", () => ({}));
vi.mock("../../sentry.server.config", () => ({}));
vi.mock("../../sentry.edge.config", () => ({}));

import { register } from "../../instrumentation";

describe("runtime version evidence", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs only the running Node version and event name at Node startup", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("PRIVATE_TEST_VALUE", "must-not-appear-in-runtime-evidence");

    await register();

    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      JSON.stringify({ event: "runtime_start", node: process.version }),
    );
  });

  it("does not report a Node version for the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await register();

    expect(console.info).not.toHaveBeenCalled();
  });

  it("does not claim runtime evidence when the runtime is unspecified", async () => {
    vi.stubEnv("NEXT_RUNTIME", undefined);

    await register();

    expect(console.info).not.toHaveBeenCalled();
  });
});
