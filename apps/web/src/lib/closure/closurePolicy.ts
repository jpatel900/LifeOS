export const CLOSURE_POLICY_ID = "closure_ritual.v1" as const;

export type ClosureSubject =
  | { kind: "project"; id: string }
  | { kind: "area"; id: string };

export type ClosureType = "complete" | "released";

export interface ClosureSummary {
  purpose: string;
  what_got_done: string;
  lessons: string;
}

export type ClosureCommand = {
  subject: ClosureSubject;
  closure_type: ClosureType;
  summary: ClosureSummary;
  policy_id: typeof CLOSURE_POLICY_ID;
} & (
  | { terminal_transition: { status: "archived" } }
  | { terminal_transition: { is_active: false } }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(record);
  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key))
  );
}

function requireNonblankString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a nonblank string.`);
  }

  return value;
}

function parseSubject(value: unknown): ClosureSubject {
  if (!isRecord(value) || !hasExactKeys(value, ["kind", "id"])) {
    throw new TypeError("subject must identify exactly one project or area.");
  }

  if (value.kind !== "project" && value.kind !== "area") {
    throw new TypeError("subject.kind must be project or area.");
  }

  return {
    kind: value.kind,
    id: requireNonblankString(value.id, "subject.id"),
  };
}

function parseClosureType(value: unknown): ClosureType {
  if (value !== "complete" && value !== "released") {
    throw new TypeError("closure_type must be complete or released.");
  }

  return value;
}

function parseSummary(value: unknown): ClosureSummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["purpose", "what_got_done", "lessons"])
  ) {
    throw new TypeError(
      "summary must contain exactly purpose, what_got_done, and lessons.",
    );
  }

  return {
    purpose: requireNonblankString(value.purpose, "summary.purpose"),
    what_got_done: requireNonblankString(
      value.what_got_done,
      "summary.what_got_done",
    ),
    lessons: requireNonblankString(value.lessons, "summary.lessons"),
  };
}

export function createClosureCommand(input: unknown): ClosureCommand {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["subject", "closure_type", "summary"])
  ) {
    throw new TypeError(
      "closure input must contain exactly one subject, closure_type, and summary.",
    );
  }

  const subject = parseSubject(input.subject);
  const closureType = parseClosureType(input.closure_type);
  const summary = parseSummary(input.summary);
  const common = {
    subject,
    closure_type: closureType,
    summary,
    policy_id: CLOSURE_POLICY_ID,
  };

  return subject.kind === "project"
    ? { ...common, terminal_transition: { status: "archived" } }
    : { ...common, terminal_transition: { is_active: false } };
}

export function createManualClosureCommand(input: unknown): ClosureCommand {
  return createClosureCommand(input);
}
