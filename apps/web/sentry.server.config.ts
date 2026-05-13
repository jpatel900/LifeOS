import * as Sentry from "@sentry/nextjs";
import {
  getSentryInitConfig,
  getSentryScopeContext,
} from "./src/lib/observability/sentry";
import { registerObservabilityRuntime } from "./src/lib/observability/runtime";

const config = getSentryInitConfig("server");

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
