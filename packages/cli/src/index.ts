#!/usr/bin/env node
import { runCli } from "./cli";

runCli(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(`${line}\n`),
  env: process.env,
}).then(
  (outcome) => {
    process.exitCode = outcome.exitCode;
  },
  (error) => {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected failure.",
      })}\n`,
    );
    process.exitCode = 1;
  },
);
