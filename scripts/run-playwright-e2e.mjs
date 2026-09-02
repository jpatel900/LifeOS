import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(scriptDir, "..");
const webDir = path.join(repoRoot, "apps", "web");
const requestedPort = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
const requestedSeededPort = process.env.PLAYWRIGHT_SEEDED_PORT
  ? Number(process.env.PLAYWRIGHT_SEEDED_PORT)
  : undefined;
const startupTimeoutMs = 180_000;
const nextCliPath = require.resolve("next/dist/bin/next", {
  paths: [webDir, repoRoot],
});
const playwrightCliPath = require.resolve("@playwright/test/cli", {
  paths: [webDir, repoRoot],
});
const warmRoutes = [
  "/",
  "/capture",
  "/triage",
  "/calendar",
  "/execute",
  "/review",
  "/settings/areas",
  "/health",
  // #555 one-shell routing: in-app stage navigation is now a real router.push,
  // so every stage route the specs reach in-app must be compiled up front —
  // an on-demand dev compile mid-test can blow the specs' 5s expect window.
  "/areas",
  "/today",
  // The signed-in tier (`tests/e2e/signed-in-account-truth.spec.ts`) starts
  // every journey at `/login`. Left unwarmed it is compiled on demand at the
  // first `goto`, which is the same on-demand-compile stall the comment above
  // describes — only now it lands on the very first action of every signed-in
  // spec instead of a mid-test navigation.
  "/login",
  "/api/parse-capture",
];
// #687 demo-seed round 2: the seeded server only ever serves `/` (through
// `demo-seed-pin.seeded.spec.ts`'s moment-surface list) — warming the whole
// `warmRoutes` set on it would just slow startup for routes that spec never
// visits.
const seededWarmRoutes = ["/"];
const serverLogBuffers = new Map();
const maxBufferedLogLines = 200;
let shuttingDown = false;

function appendLogLine(source, line) {
  if (!line) {
    return;
  }

  const buffer = serverLogBuffers.get(source) ?? [];
  buffer.push(line);
  if (buffer.length > maxBufferedLogLines) {
    buffer.shift();
  }
  serverLogBuffers.set(source, buffer);
}

function recentLog(source) {
  return (serverLogBuffers.get(source) ?? []).join("\n");
}

function forwardStream(stream, writer, source) {
  let pending = "";

  stream.on("data", (chunk) => {
    const text = chunk.toString();
    writer.write(text);
    pending += text;

    const parts = pending.split(/\r?\n/);
    pending = parts.pop() ?? "";
    for (const part of parts) {
      appendLogLine(source, part);
    }
  });

  stream.on("end", () => {
    appendLogLine(source, pending.trim());
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on("error", reject);
    server.listen({ host: "127.0.0.1", port }, () => {
      const address = server.address();

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!address || typeof address === "string") {
          reject(new Error("Could not determine Playwright dev-server port."));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function resolvePort(explicit, requested) {
  if (explicit) {
    return requested;
  }

  const fallbackPort = await reservePort(0);
  return fallbackPort;
}

async function waitForServer(baseURL, serverProcess, source) {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Next dev server (${source}) exited before ${baseURL} was ready. Recent server output:\n${recentLog(source)}`,
      );
    }

    try {
      const response = await fetch(baseURL, {
        signal: AbortSignal.timeout(5_000),
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Retry until startup deadline.
    }

    await sleep(500);
  }

  throw new Error(
    `Timed out waiting for ${baseURL}. Recent server output:\n${recentLog(source)}`,
  );
}

async function waitForRoute(baseURL, route, serverProcess, source) {
  const deadline = Date.now() + startupTimeoutMs;
  const target = new URL(route, `${baseURL}/`).toString();

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Next dev server (${source}) exited before ${target} was ready. Recent server output:\n${recentLog(source)}`,
      );
    }

    try {
      const response = await fetch(target, {
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status >= 200 && response.status < 400) {
        return;
      }
    } catch {
      // Retry until the route warmup deadline.
    }

    await sleep(250);
  }

  throw new Error(
    `Timed out warming ${target}. Recent server output:\n${recentLog(source)}`,
  );
}

async function warmCoreRoutes(baseURL, serverProcess, source, routes) {
  for (const route of routes) {
    await waitForRoute(baseURL, route, serverProcess, source);
  }
}

function cleanupServer(serverProcess) {
  if (
    shuttingDown ||
    !serverProcess ||
    serverProcess.killed ||
    serverProcess.exitCode !== null
  ) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    process.kill(-serverProcess.pid, "SIGKILL");
  } catch {
    serverProcess.kill("SIGKILL");
  }
}

function cleanupServers(serverProcesses) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const serverProcess of serverProcesses) {
    cleanupServer(serverProcess);
  }
}

function exitWithSignal(serverProcesses, code) {
  cleanupServers(serverProcesses);
  process.exit(code);
}

/**
 * Spawns one `next dev` server, waits for it to answer, and warms its core
 * routes. `env` is layered on top of `process.env` — callers set exactly the
 * flags that make this server different from any other (moments-home flag,
 * demo-seed flag, port).
 */
async function startServer(port, env, source, routes) {
  const baseURL = `http://127.0.0.1:${port}`;
  const serverArgs = [
    nextCliPath,
    "dev",
    "--hostname",
    "127.0.0.1",
    "-p",
    String(port),
  ];
  const serverProcess = spawn(process.execPath, serverArgs, {
    cwd: webDir,
    env: {
      ...process.env,
      PORT: port,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  forwardStream(serverProcess.stdout, process.stdout, `${source}:stdout`);
  forwardStream(serverProcess.stderr, process.stderr, `${source}:stderr`);

  try {
    await waitForServer(baseURL, serverProcess, source);
    await warmCoreRoutes(baseURL, serverProcess, source, routes);
  } catch (error) {
    cleanupServer(serverProcess);
    throw error;
  }

  return { serverProcess, baseURL };
}

async function main() {
  const port = await resolvePort(
    Boolean(process.env.PLAYWRIGHT_PORT),
    requestedPort,
  );
  const seededPort = await resolvePort(
    Boolean(requestedSeededPort),
    requestedSeededPort ?? port + 1,
  );
  if (!process.env.PLAYWRIGHT_PORT || !requestedSeededPort) {
    console.warn(
      `[playwright-e2e] main server ${port}, seeded server ${seededPort}.`,
    );
  }

  const testArgs = [playwrightCliPath, "test", ...process.argv.slice(2)];

  const baseEnv = {
    // Moments pass P7b: the E2E lane serves the go-live config where `/` is
    // the moments home. This is the CI server-start path (Playwright's own
    // webServer is disabled here), so the flag must be set on THIS spawn;
    // an explicit outer NEXT_PUBLIC_MOMENTS_HOME still wins if provided.
    NEXT_PUBLIC_MOMENTS_HOME: process.env.NEXT_PUBLIC_MOMENTS_HOME ?? "true",
  };

  let mainServer;
  let seededServer;
  const started = [];

  process.on("SIGINT", () =>
    exitWithSignal(
      started.map((s) => s.serverProcess),
      130,
    ),
  );
  process.on("SIGTERM", () =>
    exitWithSignal(
      started.map((s) => s.serverProcess),
      143,
    ),
  );
  process.on("uncaughtException", (error) => {
    console.error(error);
    exitWithSignal(
      started.map((s) => s.serverProcess),
      1,
    );
  });
  process.on("unhandledRejection", (error) => {
    console.error(error);
    exitWithSignal(
      started.map((s) => s.serverProcess),
      1,
    );
  });

  try {
    mainServer = await startServer(
      port,
      {
        ...baseEnv,
        // #687 demo-seed, independent verifier round 1 — THIS is the server
        // CI actually runs the whole (non-seeded) e2e suite against
        // (playwright.config.ts's own `webServer` block is disabled below
        // via PLAYWRIGHT_DISABLE_WEBSERVER, so setting the flag there alone
        // never reached CI). Every spec in this lane navigates `/` in
        // unconfigured mode; only three specs were ever re-targeted for the
        // seed's existence — the default here stays OFF, same reasoning as
        // the MOMENTS_HOME line above, an explicit outer
        // NEXT_PUBLIC_DEMO_SEED still wins if one is ever set.
        NEXT_PUBLIC_DEMO_SEED: process.env.NEXT_PUBLIC_DEMO_SEED ?? "false",
      },
      "next-main",
      warmRoutes,
    );
    started.push(mainServer);

    // #687 demo-seed round 2 (independent verifier finding 4) — the second
    // server `demo-seed-pin.seeded.spec.ts` runs against, with the seed
    // genuinely ON. Harmony-extended alongside the main server spawn above
    // rather than a second script or workflow.
    seededServer = await startServer(
      seededPort,
      {
        ...baseEnv,
        NEXT_PUBLIC_DEMO_SEED: "true",
        // Separate build cache from the main server (next.config.ts) —
        // two `next dev` processes from the same webDir must not share
        // `.next/`.
        NEXT_DIST_DIR: ".next-seeded",
      },
      "next-seeded",
      seededWarmRoutes,
    );
    started.push(seededServer);
  } catch (error) {
    cleanupServers(started.map((s) => s.serverProcess));
    throw error;
  }

  const playwrightProcess = spawn(process.execPath, testArgs, {
    cwd: webDir,
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: port,
      PLAYWRIGHT_SEEDED_PORT: seededPort,
      PLAYWRIGHT_DISABLE_WEBSERVER: "1",
    },
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    playwrightProcess.on("error", reject);
    playwrightProcess.on("exit", (code) => resolve(code ?? 1));
  });

  cleanupServers(started.map((s) => s.serverProcess));
  process.exit(exitCode);
}

await main();
