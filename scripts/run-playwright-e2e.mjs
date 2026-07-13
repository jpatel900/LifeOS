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
  "/api/parse-capture",
];
const serverLogBuffer = [];
const maxBufferedLogLines = 200;
let shuttingDown = false;

function appendLogLine(source, line) {
  if (!line) {
    return;
  }

  serverLogBuffer.push(`[${source}] ${line}`);
  if (serverLogBuffer.length > maxBufferedLogLines) {
    serverLogBuffer.shift();
  }
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

async function resolvePort() {
  if (process.env.PLAYWRIGHT_PORT) {
    return requestedPort;
  }

  const fallbackPort = await reservePort(0);
  console.warn(
    `[playwright-e2e] Using isolated port ${fallbackPort} for this run.`,
  );
  return fallbackPort;
}

async function waitForServer(baseURL, serverProcess) {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Next dev server exited before ${baseURL} was ready. Recent server output:\n${serverLogBuffer.join("\n")}`,
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
    `Timed out waiting for ${baseURL}. Recent server output:\n${serverLogBuffer.join("\n")}`,
  );
}

async function waitForRoute(baseURL, route, serverProcess) {
  const deadline = Date.now() + startupTimeoutMs;
  const target = new URL(route, `${baseURL}/`).toString();

  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Next dev server exited before ${target} was ready. Recent server output:\n${serverLogBuffer.join("\n")}`,
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
    `Timed out warming ${target}. Recent server output:\n${serverLogBuffer.join("\n")}`,
  );
}

async function warmCoreRoutes(baseURL, serverProcess) {
  for (const route of warmRoutes) {
    await waitForRoute(baseURL, route, serverProcess);
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

  shuttingDown = true;

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

function exitWithSignal(serverProcess, code) {
  cleanupServer(serverProcess);
  process.exit(code);
}

async function main() {
  const port = await resolvePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const serverArgs = [
    nextCliPath,
    "dev",
    "--hostname",
    "127.0.0.1",
    "-p",
    String(port),
  ];
  const testArgs = [playwrightCliPath, "test", ...process.argv.slice(2)];
  const serverProcess = spawn(process.execPath, serverArgs, {
    cwd: webDir,
    env: {
      ...process.env,
      PORT: port,
      // Moments pass P7b: the E2E lane serves the go-live config where `/` is
      // the moments home. This is the CI server-start path (Playwright's own
      // webServer is disabled here), so the flag must be set on THIS spawn;
      // an explicit outer NEXT_PUBLIC_MOMENTS_HOME still wins if provided.
      NEXT_PUBLIC_MOMENTS_HOME: process.env.NEXT_PUBLIC_MOMENTS_HOME ?? "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });

  forwardStream(serverProcess.stdout, process.stdout, "next:stdout");
  forwardStream(serverProcess.stderr, process.stderr, "next:stderr");

  process.on("SIGINT", () => exitWithSignal(serverProcess, 130));
  process.on("SIGTERM", () => exitWithSignal(serverProcess, 143));
  process.on("uncaughtException", (error) => {
    console.error(error);
    exitWithSignal(serverProcess, 1);
  });
  process.on("unhandledRejection", (error) => {
    console.error(error);
    exitWithSignal(serverProcess, 1);
  });

  try {
    await waitForServer(baseURL, serverProcess);
    await warmCoreRoutes(baseURL, serverProcess);
  } catch (error) {
    cleanupServer(serverProcess);
    throw error;
  }

  const playwrightProcess = spawn(process.execPath, testArgs, {
    cwd: webDir,
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: port,
      PLAYWRIGHT_DISABLE_WEBSERVER: "1",
    },
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolve, reject) => {
    playwrightProcess.on("error", reject);
    playwrightProcess.on("exit", (code) => resolve(code ?? 1));
  });

  cleanupServer(serverProcess);
  process.exit(exitCode);
}

await main();
