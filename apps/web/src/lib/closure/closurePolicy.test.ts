import { describe, expect, it } from "vitest";

import {
  CLOSURE_POLICY_ID,
  createClosureCommand,
  createManualClosureCommand,
} from "./closurePolicy";

const projectInput = {
  subject: { kind: "project", id: "project-1" },
  closure_type: "complete",
  summary: {
    purpose: "Ship the useful slice",
    what_got_done: "The useful slice shipped",
    lessons: "Smaller slices finished faster",
  },
};

describe("createClosureCommand", () => {
  it("freezes the policy id and creates the existing project terminal transition", () => {
    expect(CLOSURE_POLICY_ID).toBe("closure_ritual.v1");
    expect(createClosureCommand(projectInput)).toStrictEqual({
      subject: { kind: "project", id: "project-1" },
      closure_type: "complete",
      summary: {
        purpose: "Ship the useful slice",
        what_got_done: "The useful slice shipped",
        lessons: "Smaller slices finished faster",
      },
      policy_id: "closure_ritual.v1",
      terminal_transition: { status: "archived" },
    });
  });

  it("creates the existing area terminal transition for released work", () => {
    expect(
      createClosureCommand({
        ...projectInput,
        subject: { kind: "area", id: "area-1" },
        closure_type: "released",
      }),
    ).toStrictEqual({
      subject: { kind: "area", id: "area-1" },
      closure_type: "released",
      summary: projectInput.summary,
      policy_id: "closure_ritual.v1",
      terminal_transition: { is_active: false },
    });
  });

  it.each([
    ["bulk subjects", { ...projectInput, subject: [projectInput.subject] }],
    [
      "unknown subject kind",
      { ...projectInput, subject: { kind: "task", id: "task-1" } },
    ],
    ["blank id", { ...projectInput, subject: { kind: "project", id: "  " } }],
    ["unknown terminal type", { ...projectInput, closure_type: "failed" }],
    ["abandoned terminal type", { ...projectInput, closure_type: "abandoned" }],
    [
      "blank purpose",
      { ...projectInput, summary: { ...projectInput.summary, purpose: "" } },
    ],
    [
      "blank what got done",
      {
        ...projectInput,
        summary: { ...projectInput.summary, what_got_done: " \n " },
      },
    ],
    [
      "blank lessons",
      { ...projectInput, summary: { ...projectInput.summary, lessons: "" } },
    ],
    [
      "extra summary field",
      { ...projectInput, summary: { ...projectInput.summary, mood: "proud" } },
    ],
  ])("rejects %s", (_label, input) => {
    expect(() => createClosureCommand(input)).toThrow(TypeError);
  });

  it("does not mutate untrusted input and produces byte-identical output", () => {
    const input = structuredClone(projectInput);
    const before = JSON.stringify(input);

    const first = createClosureCommand(input);
    const second = createClosureCommand(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).not.toBe(second);
    expect(first.summary).not.toBe(input.summary);
  });
});

describe("createManualClosureCommand", () => {
  it("creates the same deterministic command without AI provenance", () => {
    const command = createManualClosureCommand(projectInput);

    expect(command).toStrictEqual(createClosureCommand(projectInput));
    expect(JSON.stringify(command)).not.toMatch(
      /ai|model|suggestion|provenance/i,
    );
  });
});
