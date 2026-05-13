import type { ObservabilityEnv } from "./config";
import { getObservabilityProviderStatus } from "./config";

function readEnvValue(
  env: ObservabilityEnv,
  key: keyof ObservabilityEnv,
): string | undefined {
  const value = env[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getPostHogInitConfig(env: ObservabilityEnv = process.env) {
  if (getObservabilityProviderStatus("posthog", env).state !== "configured") {
    return null;
  }

  return {
    api_host: readEnvValue(env, "NEXT_PUBLIC_POSTHOG_HOST"),
    autocapture: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_pageleave: false,
    capture_pageview: false,
    defaults: "2026-01-30",
    disable_session_recording: true,
    disable_surveys: true,
    enable_heatmaps: false,
    loaded: () => undefined,
    logs: {
      captureConsoleLogs: false,
    },
    persistence: "localStorage+cookie",
    rageclick: false,
  };
}

export function getPostHogToken(env: ObservabilityEnv = process.env) {
  return readEnvValue(env, "NEXT_PUBLIC_POSTHOG_TOKEN");
}
