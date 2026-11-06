import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const map = readFileSync(
  new URL("../../docs/SYSTEM_MAP.md", import.meta.url),
  "utf8",
);
const currentSources = ["program/final-ux-loop.md", "program/campaigns.json"];

test("builder orientation names current authority in both its truth map and cold start", () => {
  const truthMap = map
    .split("## Where truth lives")[1]
    ?.split("## How to change")[0];
  const coldStart = map
    .split("## Cold-start reading order")[1]
    ?.split("## Named principles")[0];
  assert.ok(truthMap && coldStart, "both orientation entry points must exist");
  for (const path of currentSources) {
    assert.ok(truthMap.includes(path), `truth map omits ${path}`);
    const index = coldStart.indexOf(path);
    assert.ok(index >= 0, `cold start omits ${path}`);
    const epic = coldStart.indexOf("The epic/issue");
    assert.ok(
      epic > index,
      "consult current authority before the historical epic contract",
    );
    assert.ok(
      readFileSync(new URL(`../../docs/${path}`, import.meta.url), "utf8")
        .length > 0,
    );
  }
  assert.match(map, /historical.*(?:execution queue|work queue)/i);
});
