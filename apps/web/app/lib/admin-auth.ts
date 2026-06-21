import { hasPrivateRepositoryCredentialsConfigured, isHostedRuntime } from "./source-policy";
import { verifySecretToken } from "./secure-token";

interface HeaderReader {
  get(name: string): string | null;
}

type AdminAuthEnv = Record<string, string | undefined>;

export interface AdminAuthResult {
  configured: boolean;
  required: boolean;
  authorized: boolean;
  missingConfiguration?: boolean;
}

export function evaluateAdminAuth(headers: HeaderReader, env: AdminAuthEnv = process.env): AdminAuthResult {
  const configuredToken = readEnv(env, "PROJECT_AUTOPSY_ADMIN_TOKEN");
  const required = isAdminAuthRequired(env);

  if (!configuredToken) {
    return required
      ? { configured: false, required, authorized: false, missingConfiguration: true }
      : { configured: false, required, authorized: true };
  }

  const requestToken = readBearerToken(headers.get("authorization")) ?? readHeaderToken(headers);

  return {
    configured: true,
    required: true,
    authorized: verifySecretToken(requestToken, configuredToken)
  };
}

export function isAdminAuthRequired(env: AdminAuthEnv = process.env): boolean {
  return Boolean(
    readEnv(env, "PROJECT_AUTOPSY_ADMIN_TOKEN") ||
      isHostedRuntime(env) ||
      hasPrivateRepositoryCredentialsConfigured(env) ||
      readEnv(env, "PROJECT_AUTOPSY_POSTGRES_URL") ||
      readEnv(env, "DATABASE_URL")
  );
}

export function adminAuthFailureStatus(auth: AdminAuthResult): number {
  return auth.missingConfiguration ? 503 : 401;
}

export function adminAuthFailureMessage(auth: AdminAuthResult): string {
  if (auth.missingConfiguration) {
    return "PROJECT_AUTOPSY_ADMIN_TOKEN is required when hosted administrative access is protected.";
  }

  return "Admin token required.";
}

function readBearerToken(value: string | null): string | undefined {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function readHeaderToken(headers: HeaderReader): string | undefined {
  const value = headers.get("x-project-autopsy-admin-token")?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readEnv(env: AdminAuthEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
