import { describe, expect, it } from "vitest";
import {
  PersistenceWriteError,
  classifyPersistenceFailure,
  getPersistenceFailureKind,
} from "./persistenceFailureKind";

describe("persistenceFailureKind", () => {
  it("classifies exact capability-missing provider codes", () => {
    expect(classifyPersistenceFailure({ code: "PGRST202" })).toBe(
      "server-capability-missing",
    );
    expect(classifyPersistenceFailure({ code: "42883" })).toBe(
      "server-capability-missing",
    );
    expect(classifyPersistenceFailure({ code: "42703" })).toBe(
      "server-capability-missing",
    );
  });

  it("keeps unknown for 404 and text-only errors", () => {
    expect(classifyPersistenceFailure({ code: "404" })).toBe("unknown");
    expect(
      classifyPersistenceFailure({
        message: "function unplan_calendar_block does not exist",
      }),
    ).toBe("unknown");
    expect(
      classifyPersistenceFailure({
        details: "function unplan_calendar_block does not exist",
      }),
    ).toBe("unknown");
  });

  it("does not normalize or infer from nested values", () => {
    expect(classifyPersistenceFailure({ code: "pgrst202" })).toBe("unknown");
    expect(
      classifyPersistenceFailure({ details: { code: "42703" } } as Record<
        string,
        unknown
      >),
    ).toBe("unknown");
    expect(
      classifyPersistenceFailure({
        code: ["42703"],
      } as Record<string, unknown>),
    ).toBe("unknown");
  });

  it("preserves the human message in persistence write errors", () => {
    const error = new PersistenceWriteError(
      "Google calendar RPC is not supported.",
      "server-capability-missing",
    );

    expect(error.message).toBe("Google calendar RPC is not supported.");
    expect(error.failureKind).toBe("server-capability-missing");
    expect(error).toBeInstanceOf(PersistenceWriteError);
  });

  it("reads failure kind only from wrapped failure errors", () => {
    expect(getPersistenceFailureKind(new Error("just a plain error"))).toBe(
      "unknown",
    );
    expect(
      getPersistenceFailureKind(
        new PersistenceWriteError("missing", "server-capability-missing"),
      ),
    ).toBe("server-capability-missing");
    expect(
      getPersistenceFailureKind(new PersistenceWriteError("ok", "unknown")),
    ).toBe("unknown");
    expect(
      getPersistenceFailureKind({
        failureKind: "server-capability-missing",
      } as unknown as Error),
    ).toBe("unknown");
  });
});
