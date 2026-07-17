import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/capabilities", () => {
  it("returns machine-readable capabilities with no auth required", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.api_version).toBe("1");
    expect(body.app).toEqual({ name: "lifeos", component: "@lifeos/web" });
    expect(body.capabilities).toEqual([
      "capabilities.read",
      "tasks.list",
      "captures.create",
      "areas.list",
      "blocks.list",
    ]);
    expect(body.auth.scheme).toBe("bearer");
  });

  it("never caches (agents must see live capability state)", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("exposes no user data or secrets", async () => {
    const body = await (await GET()).json();
    const serialized = JSON.stringify(body).toLowerCase();
    // The payload may DESCRIBE the auth scheme, but must never carry key
    // material or user data.
    for (const forbidden of [
      "service_role_key",
      "anon_key",
      "password",
      "user_id",
      "email",
      "eyj", // JWT prefix
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
