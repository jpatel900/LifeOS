export type PersistenceFailureKind =
  | "server-capability-missing"
  | "invalid-write"
  | "unknown";

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

/** Only use for input validation before an account write can begin. */
export function parsePersistenceWriteInput<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PersistenceWriteError(
      "This saved change contains invalid information.",
      "invalid-write",
    );
  }
  return result.data;
}

export function getPersistenceFailureKind(
  error: unknown,
): PersistenceFailureKind {
  if (error instanceof PersistenceWriteError) {
    return error.failureKind === "server-capability-missing" ||
      error.failureKind === "invalid-write"
      ? error.failureKind
      : "unknown";
  }

  return "unknown";
}
