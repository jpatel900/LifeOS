import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessToken, login } from "./auth";
import type { CliConfig } from "./config";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: mocks }),
}));

const session = {
  access_token: "SYNTHETIC_ACCESS",
  refresh_token: "SYNTHETIC_REFRESH",
  expires_at: 4_000_000_000,
  user: { email: "synthetic@example.invalid" },
};
let privateDir: string;

function config(sessionFile: string): CliConfig {
  return {
    apiUrl: "https://example.invalid",
    supabaseUrl: "https://example.invalid",
    supabaseAnonKey: "SYNTHETIC_ANON",
    sessionFile,
  };
}

function mode(file: string): number {
  return fs.statSync(file).mode & 0o777;
}

beforeEach(() => {
  vi.clearAllMocks();
  privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-auth-test-"));
  mocks.signInWithPassword.mockResolvedValue({
    data: { session },
    error: null,
  });
  mocks.refreshSession.mockResolvedValue({ data: { session }, error: null });
});

afterEach(() => {
  fs.rmSync(privateDir, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")(
  "session file permissions",
  () => {
    it("restricts an existing session after login and refresh", async () => {
      const existingDir = path.join(privateDir, "configured");
      fs.mkdirSync(existingDir, { mode: 0o700 });
      fs.chmodSync(existingDir, 0o700);
      const sessionFile = path.join(existingDir, "session.json");
      fs.writeFileSync(sessionFile, "{}", { mode: 0o644 });
      fs.chmodSync(sessionFile, 0o644);

      await expect(
        login(
          config(sessionFile),
          "synthetic@example.invalid",
          "SYNTHETIC_PASSWORD",
        ),
      ).resolves.toEqual({ email: session.user.email });
      expect(mode(sessionFile)).toBe(0o600);
      expect(mode(existingDir)).toBe(0o700);
      expect(mode(privateDir)).toBe(0o700);
      expect(JSON.parse(fs.readFileSync(sessionFile, "utf8"))).toEqual({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user_email: session.user.email,
      });

      fs.writeFileSync(
        sessionFile,
        JSON.stringify({ ...session, expires_at: 1 }),
      );
      fs.chmodSync(sessionFile, 0o644);
      await expect(getAccessToken(config(sessionFile))).resolves.toBe(
        session.access_token,
      );
      expect(mode(sessionFile)).toBe(0o600);
      expect(mode(existingDir)).toBe(0o700);
      expect(JSON.parse(fs.readFileSync(sessionFile, "utf8"))).toEqual({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user_email: session.user.email,
      });
      expect(mocks.signInWithPassword).toHaveBeenCalledOnce();
      expect(mocks.refreshSession).toHaveBeenCalledOnce();
    });

    it("creates private nested session directories", async () => {
      const parent = path.join(privateDir, "new");
      const nested = path.join(parent, "nested");
      const sessionFile = path.join(nested, "session.json");

      await login(
        config(sessionFile),
        "synthetic@example.invalid",
        "SYNTHETIC_PASSWORD",
      );

      expect(mode(parent)).toBe(0o700);
      expect(mode(nested)).toBe(0o700);
      expect(mode(sessionFile)).toBe(0o600);
      expect(JSON.parse(fs.readFileSync(sessionFile, "utf8"))).toEqual({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user_email: session.user.email,
      });
    });
  },
);
