#!/usr/bin/env node
import assert from "node:assert/strict";
import { test } from "node:test";

import { assembleDriftFixSql } from "./assemble-migration-sql.mjs";

const migrations = [
  {
    version: "20260705120000",
    name: "add_task_is_reversible",
    body: "alter table tasks add column is_reversible boolean not null default false;\n\n-- keep exactly this comment\n",
  },
  {
    version: "20260705130000",
    name: "add_execution_session_cap_outcome",
    body: "create type execution_session_cap_outcome as enum ('done', 'stopped');\nselect 'second body';\n",
  },
];

const sql = assembleDriftFixSql(migrations, { date: "2026-07-07" });

test("wraps the drift fix in one transaction", () => {
  assert.ok(sql.startsWith("begin;"));
  assert.ok(sql.endsWith("commit;"));
});

test("includes both migration headers and bodies verbatim", () => {
  assert.match(sql, /-- 20260705120000_add_task_is_reversible\.sql/);
  assert.match(sql, /-- 20260705130000_add_execution_session_cap_outcome\.sql/);
  assert.match(
    sql,
    /alter table tasks add column is_reversible boolean not null default false;\n\n-- keep exactly this comment/,
  );
  assert.match(
    sql,
    /create type execution_session_cap_outcome as enum \('done', 'stopped'\);\nselect 'second body';/,
  );
});

test("records both ledger rows in order with the requested date", () => {
  const firstRow =
    "  ('20260705120000', 'add_task_is_reversible', array['applied via drift-response runbook 2026-07-07']),";
  const secondRow =
    "  ('20260705130000', 'add_execution_session_cap_outcome', array['applied via drift-response runbook 2026-07-07']);";

  assert.ok(sql.includes(firstRow));
  assert.ok(sql.includes(secondRow));
  assert.ok(sql.indexOf(firstRow) < sql.indexOf(secondRow));
});

test("preserves the order passed by the caller", () => {
  assert.ok(
    sql.indexOf("-- 20260705120000_add_task_is_reversible.sql") <
      sql.indexOf("-- 20260705130000_add_execution_session_cap_outcome.sql"),
  );
});
