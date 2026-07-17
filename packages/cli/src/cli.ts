import crypto from "node:crypto";
import * as api from "./api";
import * as auth from "./auth";
import { loadConfig, type CliConfig } from "./config";

/**
 * Command surface (slice 1, issue #637):
 *   lifeos capabilities
 *   lifeos tasks list
 *   lifeos areas list [--include-inactive]
 *   lifeos today [--date YYYY-MM-DD]
 *   lifeos capture <text> [--return-hook <hook>] [--area-id <uuid>] [--client-capture-id <uuid>]
 *   lifeos login --email <email> [--password-env <VAR>]
 *   lifeos logout
 *   lifeos whoami
 *
 * Contract for agents/scripts: exactly ONE JSON object on stdout per
 * invocation — `{ ok: true, data: ... }` or `{ ok: false, error: ... }` —
 * exit code 0 on ok, 1 otherwise. Nothing else is ever printed to stdout.
 */

export interface CliIo {
  stdout: (line: string) => void;
  env: NodeJS.ProcessEnv;
}

export interface CliOutcome {
  exitCode: 0 | 1;
}

interface ParsedFlags {
  positionals: string[];
  flags: Record<string, string>;
}

function parseFlags(args: string[]): ParsedFlags {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        flags[name] = "true";
      } else {
        flags[name] = value;
        i += 1;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags };
}

function emit(io: CliIo, payload: unknown, exitCode: 0 | 1): CliOutcome {
  io.stdout(JSON.stringify(payload));
  return { exitCode };
}

function emitError(io: CliIo, message: string): CliOutcome {
  return emit(io, { ok: false, error: message }, 1);
}

function emitApiResult(io: CliIo, result: api.ApiResult): CliOutcome {
  const ok =
    typeof result.body === "object" &&
    result.body !== null &&
    (result.body as { ok?: unknown }).ok === true;
  return emit(io, result.body, ok ? 0 : 1);
}

const USAGE = {
  ok: false,
  error:
    "Usage: lifeos <capabilities | tasks list | areas list | today | capture <text> | login --email <email> | logout | whoami>",
};

/**
 * Day authority stays CLIENT-side (#642): the local day window is computed
 * here from the machine's clock/timezone — the server never derives "today"
 * itself. `--date YYYY-MM-DD` pins the day; otherwise the current local day.
 */
export function localDayWindow(
  now: Date,
  dateFlag?: string,
): { start: string; end: string } | null {
  let year: number;
  let monthIndex: number;
  let day: number;

  if (dateFlag !== undefined) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateFlag);
    if (!match) return null;
    year = Number(match[1]);
    monthIndex = Number(match[2]) - 1;
    day = Number(match[3]);
  } else {
    year = now.getFullYear();
    monthIndex = now.getMonth();
    day = now.getDate();
  }

  const start = new Date(year, monthIndex, day, 0, 0, 0, 0);
  const end = new Date(year, monthIndex, day + 1, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || start.getDate() !== day) return null;

  return { start: start.toISOString(), end: end.toISOString() };
}

export async function runCli(
  argv: string[],
  io: CliIo,
  configOverride?: CliConfig,
): Promise<CliOutcome> {
  let config: CliConfig;
  try {
    config = configOverride ?? loadConfig(io.env);
  } catch (error) {
    return emitError(
      io,
      error instanceof Error ? error.message : "Configuration failed.",
    );
  }

  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "capabilities": {
        return emitApiResult(io, await api.getCapabilities(config));
      }

      case "tasks": {
        if (rest[0] !== "list") return emit(io, USAGE, 1);
        const token = await auth.getAccessToken(config);
        return emitApiResult(io, await api.listTasks(config, token));
      }

      case "areas": {
        if (rest[0] !== "list") return emit(io, USAGE, 1);
        const { flags } = parseFlags(rest.slice(1));
        const token = await auth.getAccessToken(config);
        return emitApiResult(
          io,
          await api.listAreas(config, token, {
            includeInactive: flags["include-inactive"] === "true",
          }),
        );
      }

      case "today": {
        const { flags } = parseFlags(rest);
        const window = localDayWindow(new Date(), flags.date);
        if (!window) {
          return emitError(io, "today requires --date as YYYY-MM-DD.");
        }
        const token = await auth.getAccessToken(config);
        return emitApiResult(io, await api.listBlocks(config, token, window));
      }

      case "capture": {
        const { positionals, flags } = parseFlags(rest);
        const rawText = positionals.join(" ");
        if (!rawText.trim()) {
          return emitError(io, "capture requires non-empty text.");
        }
        const token = await auth.getAccessToken(config);
        return emitApiResult(
          io,
          await api.createCapture(config, token, {
            raw_text: rawText,
            return_hook: flags["return-hook"] ?? null,
            area_id: flags["area-id"] ?? null,
            client_capture_id:
              flags["client-capture-id"] ?? crypto.randomUUID(),
          }),
        );
      }

      case "login": {
        const { flags } = parseFlags(rest);
        const email = flags.email;
        if (!email) return emitError(io, "login requires --email <email>.");
        // Headless password entry: read from an env var (default
        // LIFEOS_PASSWORD) so the secret never appears in argv/process
        // lists or shell history.
        const passwordEnvName = flags["password-env"] ?? "LIFEOS_PASSWORD";
        const password = io.env[passwordEnvName];
        if (!password) {
          return emitError(
            io,
            `login reads the password from $${passwordEnvName}; it is not set.`,
          );
        }
        const result = await auth.login(config, email, password);
        return emit(io, { ok: true, data: { signed_in: true, ...result } }, 0);
      }

      case "logout": {
        return emit(io, { ok: true, data: auth.logout(config) }, 0);
      }

      case "whoami": {
        return emit(io, { ok: true, data: auth.whoami(config) }, 0);
      }

      default:
        return emit(io, USAGE, 1);
    }
  } catch (error) {
    return emitError(
      io,
      error instanceof Error ? error.message : "Command failed.",
    );
  }
}
