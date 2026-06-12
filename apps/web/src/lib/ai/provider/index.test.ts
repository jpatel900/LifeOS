import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_PROVIDER_ID,
  resolveStructuredOutputProvider,
} from "./index";

describe("resolveStructuredOutputProvider", () => {
  it("defaults to the openai provider when AI_PROVIDER is unset", () => {
    const provider = resolveStructuredOutputProvider({});
    expect(provider.id).toBe(DEFAULT_AI_PROVIDER_ID);
    expect(provider.id).toBe("openai");
  });

  it("resolves openai case-insensitively with whitespace", () => {
    const provider = resolveStructuredOutputProvider({
      AI_PROVIDER: "  OpenAI  ",
    });
    expect(provider.id).toBe("openai");
  });

  it("rejects unknown providers with a recoverable message", () => {
    expect(() =>
      resolveStructuredOutputProvider({ AI_PROVIDER: "acme" }),
    ).toThrow(/Unknown AI_PROVIDER "acme"/);
  });
});
