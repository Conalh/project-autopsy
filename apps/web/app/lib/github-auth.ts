import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

interface GitHubTokenResponse {
  token?: string;
}

type GitHubAuthEnv = Record<string, string | undefined>;

export async function resolveGitHubToken(
  env: GitHubAuthEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<string | undefined> {
  const token = readEnv(env, "PROJECT_AUTOPSY_GITHUB_TOKEN");
  if (token) {
    return token;
  }

  const appId = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_ID");
  const installationId = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID");
  const privateKey = readGitHubAppPrivateKey(env);
  if (!appId || !installationId || !privateKey) {
    return undefined;
  }

  const jwt = createGitHubAppJwt(appId, privateKey);
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "user-agent": "project-autopsy",
        "x-github-api-version": "2022-11-28"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub App installation token request failed (${response.status})`);
  }

  const body = (await response.json()) as GitHubTokenResponse;
  if (!body.token) {
    throw new Error("GitHub App installation token response did not include a token.");
  }

  return body.token;
}

function createGitHubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 540,
    iss: appId
  });
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey).toString("base64url");

  return `${unsignedToken}.${signature}`;
}

function readGitHubAppPrivateKey(env: GitHubAuthEnv): string | undefined {
  const inlineKey = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY");
  if (inlineKey) {
    return inlineKey.replace(/\\n/g, "\n");
  }

  const keyPath = readEnv(env, "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH");
  if (!keyPath) {
    return undefined;
  }

  return readFileSync(keyPath, "utf8");
}

function readEnv(env: GitHubAuthEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
