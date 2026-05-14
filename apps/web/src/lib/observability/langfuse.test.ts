import { describe, expect, it } from "vitest";
import { getLangfuseInitConfig } from "./langfuse";

describe("Langfuse observability helpers", () => {
  it("returns null config when Langfuse env vars are absent", () => {
    expect(getLangfuseInitConfig({})).toBeNull();
  });

  it("builds an immediate server-only config when Langfuse env vars are present", () => {
    expect(
      getLangfuseInitConfig({
        NODE_ENV: "test",
        LANGFUSE_PUBLIC_KEY: "pk-lf-public",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
        LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
      }),
    ).toEqual({
      publicKey: "pk-lf-public",
      secretKey: "sk-lf-secret",
      baseUrl: "https://cloud.langfuse.com",
      environment: "test",
      exportMode: "immediate",
      timeout: 5,
    });
  });
});
