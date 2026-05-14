import { describe, expect, it } from "vitest";
import { sanitizeEventProperties } from "./sanitize";
import { getPostHogInitConfig, getPostHogToken } from "./posthog";

describe("PostHog observability adapter helpers", () => {
  it("returns null config and no token when PostHog env vars are absent", () => {
    expect(getPostHogInitConfig({})).toBeNull();
    expect(getPostHogToken({})).toBeUndefined();
  });

  it("builds a manual-only PostHog config", () => {
    const config = getPostHogInitConfig({
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
      NEXT_PUBLIC_POSTHOG_TOKEN: "phc_test_token",
    });

    expect(config).toMatchObject({
      api_host: "https://us.i.posthog.com",
      autocapture: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      capture_heatmaps: false,
      capture_pageleave: false,
      capture_pageview: false,
      disable_session_recording: true,
      disable_surveys: true,
      enable_heatmaps: false,
      logs: {
        captureConsoleLogs: false,
      },
      rageclick: false,
    });
  });

  it("keeps only allowlisted safe properties for representative workflow events", () => {
    expect(
      sanitizeEventProperties({
        area_present: true,
        feature: "capture",
        raw_text: "do not export",
        status: "new",
      }),
    ).toEqual({
      area_present: true,
      feature: "capture",
      status: "new",
    });

    expect(
      sanitizeEventProperties({
        feature: "calendar",
        item_type: "proposal",
        provider: "google_calendar",
        status: "failed",
        title: "Board meeting",
        description: "private details",
        token: "secret",
      }),
    ).toEqual({
      feature: "calendar",
      item_type: "proposal",
      provider: "google_calendar",
      status: "failed",
    });

    expect(
      sanitizeEventProperties({
        area_id: "550e8400-e29b-41d4-a716-446655440000",
        feature: "execute",
        used_mock: false,
        prompt_version: "parse-capture-v1",
        schema_version: "2026-05-01",
        email: "jay@example.com",
      }),
    ).toEqual({
      area_id: "550e8400-e29b-41d4-a716-446655440000",
      feature: "execute",
      used_mock: false,
      prompt_version: "parse-capture-v1",
      schema_version: "2026-05-01",
    });
  });
});
