import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ADR 0006 static boundary guard: the CLI is a THIN client.
 * - Supabase may be imported ONLY by auth.ts, and only for auth.
 * - No module may touch Supabase data APIs (.from(...), .rpc(...)).
 * - No module may read service-role credentials (config.ts may only REJECT
 *   them — a guarded refusal, not a use).
 */

const srcDir = path.dirname(fileURLToPath(import.meta.url));

const sourceFiles = fs
  .readdirSync(srcDir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({
    name,
    content: fs.readFileSync(path.join(srcDir, name), "utf8"),
  }));

describe("CLI thinness boundary (ADR 0006)", () => {
  it("covers the expected source modules", () => {
    const names = sourceFiles.map((file) => file.name).sort();
    expect(names).toEqual([
      "api.ts",
      "auth.ts",
      "cli.ts",
      "config.ts",
      "index.ts",
    ]);
  });

  it("imports @supabase/supabase-js ONLY in auth.ts", () => {
    for (const file of sourceFiles) {
      const importsSupabase = file.content.includes("@supabase/supabase-js");
      if (file.name === "auth.ts") {
        expect(importsSupabase).toBe(true);
      } else {
        expect(
          importsSupabase,
          `${file.name} must not import supabase-js`,
        ).toBe(false);
      }
    }
  });

  it("never touches Supabase data APIs anywhere (auth only, no .from/.rpc)", () => {
    for (const file of sourceFiles) {
      expect(
        /\.\s*from\s*\(\s*["'`]/.test(file.content),
        `${file.name} must not query Supabase tables`,
      ).toBe(false);
      expect(
        /\.\s*rpc\s*\(/.test(file.content),
        `${file.name} must not call Supabase RPCs`,
      ).toBe(false);
    }
  });

  it("service-role credentials are never used — only refused in config.ts", () => {
    for (const file of sourceFiles) {
      const mentions = file.content.match(/SERVICE_ROLE/g) ?? [];
      if (file.name === "config.ts") {
        // config.ts references the names solely inside the refusal guard.
        expect(file.content).toContain("Refusing to run with a service-role");
      } else {
        expect(
          mentions.length,
          `${file.name} must not reference service-role credentials`,
        ).toBe(0);
      }
    }
  });

  it("every data command goes through fetch to /api/v1 (transport lives in api.ts alone)", () => {
    const apiModule = sourceFiles.find((file) => file.name === "api.ts");
    expect(apiModule?.content).toContain("/api/v1/");
    for (const file of sourceFiles) {
      if (file.name === "api.ts") continue;
      expect(
        file.content.includes("fetch("),
        `${file.name} must not perform HTTP itself`,
      ).toBe(false);
    }
  });
});
