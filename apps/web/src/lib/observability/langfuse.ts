import { getObservabilityProviderStatus, type ObservabilityEnv } from "./config";

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

export function getLangfuseInitConfig(env: ObservabilityEnv = process.env) {
  if (getObservabilityProviderStatus("langfuse", env).state !== "configured") {
    return null;
  }

  const publicKey = readEnvValue(env, "LANGFUSE_PUBLIC_KEY");
  const secretKey = readEnvValue(env, "LANGFUSE_SECRET_KEY");
  const baseUrl = readEnvValue(env, "LANGFUSE_BASE_URL");

  if (!publicKey || !secretKey || !baseUrl) {
    return null;
  }

  return {
    publicKey,
    secretKey,
    baseUrl,
    environment: readEnvValue(env, "NODE_ENV") ?? "development",
    exportMode: "immediate" as const,
    timeout: 5,
  };
}
