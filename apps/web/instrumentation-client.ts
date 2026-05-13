import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import {
  getPostHogInitConfig,
  getPostHogToken,
} from "./src/lib/observability/posthog";
import {
  getSentryInitConfig,
  getSentryScopeContext,
} from "./src/lib/observability/sentry";
import { registerObservabilityRuntime } from "./src/lib/observability/runtime";

const config = getSentryInitConfig("client");

if (config) {
  Sentry.init(config as Parameters<typeof Sentry.init>[0]);

  registerObservabilityRuntime({
    sentry: {
      transportMode: "sentry_sdk",
      captureException(input) {
        const scopeContext = getSentryScopeContext(input.feature, input.context);

        Sentry.withScope((scope) => {
          for (const [key, value] of Object.entries(scopeContext.tags)) {
            if (value !== null) {
              scope.setTag(key, String(value));
            }
          }

          for (const [key, value] of Object.entries(scopeContext.extra)) {
            scope.setExtra(key, value);
          }

          Sentry.captureException(input.error);
        });
      },
      async flush(timeoutMs = 2000) {
        await Sentry.flush(timeoutMs);
      },
      async shutdown(timeoutMs = 2000) {
        await Sentry.close(timeoutMs);
      },
    },
  });
}

const posthogConfig = getPostHogInitConfig();
const posthogToken = getPostHogToken();

if (posthogConfig && posthogToken) {
  posthog.init(posthogToken, posthogConfig);

  registerObservabilityRuntime({
    posthog: {
      transportMode: "posthog_js",
      captureEvent(input) {
        posthog.capture(input.event, input.properties);
      },
      flush() {
        posthog.flush();
      },
      shutdown() {
        posthog.reset();
      },
    },
  });
}
