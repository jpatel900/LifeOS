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

  it.each([
    {
      provider: "sentry" as const,
      env: {
        SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
      },
      missingKeys: ["NEXT_PUBLIC_SENTRY_DSN"],
    },
    {
      provider: "posthog" as const,
      env: {
        NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
      },
      missingKeys: ["NEXT_PUBLIC_POSTHOG_HOST"],
    },
    {
      provider: "langfuse" as const,
      env: {
        LANGFUSE_PUBLIC_KEY: "pk-lf-public",
        LANGFUSE_SECRET_KEY: "sk-lf-secret",
      },
      missingKeys: ["LANGFUSE_BASE_URL"],
    },
  ])(
    "reports missing_config for partial $provider configuration",
    ({ provider, env, missingKeys }) => {
      const status = getObservabilityProviderStatus(provider, env);

      expect(status.state).toBe("missing_config");
      expect(status.missingKeys).toEqual(missingKeys);
      expect(status.transportMode).toBe("noop");
    },
  );

  it("reports configured when provider config is complete and syntactically valid", () => {
    const sentry = getObservabilityProviderStatus("sentry", {
      NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
    });

    expect(sentry.state).toBe("configured");
    expect(sentry.invalidKeys).toEqual([]);
    expect(sentry.transportMode).toBe("sentry_sdk");
  });

  it("reports PostHog as configured only when public token and host are both present", () => {
    const posthog = getObservabilityProviderStatus("posthog", {
      NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    });

    expect(posthog.state).toBe("configured");
    expect(posthog.invalidKeys).toEqual([]);
    expect(posthog.transportMode).toBe("posthog_js");
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

  it("reports Langfuse as configured only when server-only keys and host are all present", () => {
    const langfuse = getObservabilityProviderStatus("langfuse", {
      LANGFUSE_PUBLIC_KEY: "pk-lf-public",
      LANGFUSE_SECRET_KEY: "sk-lf-secret",
      LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
    });

    expect(langfuse.state).toBe("configured");
    expect(langfuse.invalidKeys).toEqual([]);
    expect(langfuse.transportMode).toBe("langfuse_sdk");
  });

  it("reports all providers as configured and enables network telemetry when every provider is configured", () => {
    const snapshot = getObservabilityHealthSnapshot({
      NEXT_PUBLIC_SENTRY_DSN: "https://abc@example.ingest.sentry.io/123",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
      LANGFUSE_PUBLIC_KEY: "pk-lf-public",
      LANGFUSE_SECRET_KEY: "sk-lf-secret",
      LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
    });

    expect(snapshot.providers.map((provider) => provider.state)).toEqual([
      "configured",
      "configured",
      "configured",
    ]);
    expect(snapshot.providers.map((provider) => provider.transportMode)).toEqual([
      "sentry_sdk",
      "posthog_js",
      "langfuse_sdk",
    ]);
    expect(snapshot.guardrails.networkTelemetryEnabled).toBe(true);
  });
});
