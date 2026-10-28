import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../../.github/workflows/weekly-prod-smoke.yml", import.meta.url),
  "utf8",
);
// Run the shipped inline assertion, not a copy that can drift from the workflow.
const parsers = [
  ...workflow.matchAll(
    /if ! node --input-type=module -e '([\s\S]*?)' <<< "\$output"/g,
  ),
];
assert.equal(
  parsers.length,
  1,
  "expected exactly one authenticated CLI stdout assertion",
);
const parser = parsers[0][1];
const sentinel = "PRIVATE643";

function run(input) {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", parser],
    {
      input,
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("malformed CLI responses fail without disclosing their content", () => {
  for (const input of [
    sentinel,
    `{"${sentinel}":`,
    `{"ok":true,"value":"${sentinel}"} trailing`,
  ]) {
    const result = run(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(
      !result.stderr.includes(sentinel),
      "parser diagnostics leaked synthetic private content",
    );
    assert.match(result.stderr, /^stdout was not valid JSON\r?\n$/);
  }
});

test("valid private responses succeed silently", () => {
  const result = run(
    JSON.stringify({ ok: true, data: { email: sentinel, tasks: [sentinel] } }),
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("non-success shapes fail with a generic diagnostic", () => {
  for (const input of [
    "null",
    "[]",
    "true",
    "1",
    JSON.stringify(sentinel),
    JSON.stringify({ ok: false, error: sentinel }),
  ]) {
    const result = run(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr.trim(),
      "expected a single JSON object with ok:true",
    );
  }
});

test("empty or multiple JSON responses are rejected without output content", () => {
  for (const input of ["", "{}\n{}", '{"ok":true}\n{"ok":true}']) {
    const result = run(input);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), "stdout was not valid JSON");
  }
});
