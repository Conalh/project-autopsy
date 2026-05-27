interface HeaderReader {
  get(name: string): string | null;
}

type AdminAuthEnv = Record<string, string | undefined>;

export interface AdminAuthResult {
  configured: boolean;
  authorized: boolean;
}

export function evaluateAdminAuth(headers: HeaderReader, env: AdminAuthEnv = process.env): AdminAuthResult {
  const configuredToken = readEnv(env, "PROJECT_AUTOPSY_ADMIN_TOKEN");
  if (!configuredToken) {
    return {
      configured: false,
      authorized: true
    };
  }

  const requestToken = readBearerToken(headers.get("authorization")) ?? readHeaderToken(headers);

  return {
    configured: true,
    authorized: requestToken === configuredToken
  };
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
