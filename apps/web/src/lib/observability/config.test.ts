import { describe, expect, it } from "vitest";
import {
  getObservabilityHealthSnapshot,
  getObservabilityProviderStatus,
} from "./config";

describe("observability config helpers", () => {
  it("reports providers as disabled when no observability env vars are present", () => {
    const snapshot = getObservabilityHealthSnapshot({});

    expect(snapshot.providers.map((provider) => provider.state)).toEqual([
      "disabled",
      "disabled",
      "disabled",
    ]);
    expect(snapshot.guardrails).toEqual({
      networkTelemetryEnabled: false,
      sessionReplayEnabled: false,
      autocaptureEnabled: false,
      aiContentTracingEnabled: false,
    });
  });

  it("reports missing_config when only part of a provider config is present", () => {
    const posthog = getObservabilityProviderStatus("posthog", {
      NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
    });

    expect(posthog.state).toBe("missing_config");
    expect(posthog.missingKeys).toEqual(["NEXT_PUBLIC_POSTHOG_HOST"]);
  });

  it("reports configured when provider config is complete and syntactically valid", () => {
    const sentry = getObservabilityProviderStatus("sentry", {
      NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
    });

    expect(sentry.state).toBe("configured");
    expect(sentry.invalidKeys).toEqual([]);
  });

  it("reports invalid_config when a provider host field is malformed", () => {
    const langfuse = getObservabilityProviderStatus("langfuse", {
      LANGFUSE_PUBLIC_KEY: "pk-lf-public",
      LANGFUSE_SECRET_KEY: "sk-lf-secret",
      LANGFUSE_BASE_URL: "not-a-url",
    });

    expect(langfuse.state).toBe("invalid_config");
    expect(langfuse.invalidKeys).toEqual(["LANGFUSE_BASE_URL"]);
  });
});

