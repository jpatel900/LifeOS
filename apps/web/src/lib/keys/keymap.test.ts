import { describe, expect, it } from "vitest";
import { MOMENT_KEY_BINDINGS, momentKeyCollisionKey } from "./keymap";

describe("moment keymap", () => {
  it("does not bind the same key or chord to multiple actions", () => {
    const seen = new Map<string, string>();

    for (const binding of MOMENT_KEY_BINDINGS) {
      const collisionKey = momentKeyCollisionKey(binding);
      const existing = seen.get(collisionKey);
      expect(
        existing,
        `${collisionKey} is already bound to ${existing}`,
      ).toBeUndefined();
      seen.set(collisionKey, binding.id);
    }
  });

  it("contains exactly the ratified moment bindings", () => {
    expect(MOMENT_KEY_BINDINGS).toMatchInlineSnapshot(`
      [
        {
          "id": "switch-start",
          "key": "1",
          "label": "1",
          "moment": "start",
        },
        {
          "id": "switch-flow",
          "key": "2",
          "label": "2",
          "moment": "flow",
        },
        {
          "id": "switch-close",
          "key": "3",
          "label": "3",
          "moment": "close",
        },
        {
          "caseInsensitive": true,
          "id": "open-capture",
          "key": "c",
          "label": "C",
        },
        {
          "caseInsensitive": true,
          "chord": {
            "metaOrCtrl": true,
          },
          "id": "open-command-palette",
          "key": "k",
          "label": "⌘K",
        },
        {
          "id": "primary-action",
          "key": "Enter",
          "label": "↵",
        },
        {
          "id": "escape",
          "key": "Escape",
          "label": "Esc",
        },
      ]
    `);
  });
});
