export type PersistenceFailureKind = "server-capability-missing" | "unknown";

const serverCapabilityCodes = new Set(["PGRST202", "42883", "42703"]);

export function classifyPersistenceFailure(
  error: unknown,
): PersistenceFailureKind {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    serverCapabilityCodes.has(error.code)
  ) {
    return "server-capability-missing";
  }

  return "unknown";
}

export class PersistenceWriteError extends Error {
  readonly failureKind: PersistenceFailureKind;

  constructor(message: string, failureKind: PersistenceFailureKind) {
    super(message);
    this.name = "PersistenceWriteError";
    this.failureKind = failureKind;
  }
}

export function getPersistenceFailureKind(
  error: unknown,
): PersistenceFailureKind {
  if (error instanceof PersistenceWriteError) {
    return error.failureKind === "server-capability-missing"
      ? error.failureKind
      : "unknown";
  }

  return "unknown";
}
