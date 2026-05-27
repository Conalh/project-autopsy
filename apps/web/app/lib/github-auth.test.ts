import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test } from "vitest";
import { resolveGitHubToken } from "./github-auth";

describe("GitHub auth resolver", () => {
  test("prefers an explicit GitHub token over GitHub App settings", async () => {
    const token = await resolveGitHubToken(
      {
        PROJECT_AUTOPSY_GITHUB_TOKEN: "pat-token",
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID: "456",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: createPrivateKey()
      },
      async () => {
        throw new Error("GitHub App token endpoint should not be called");
      }
    );

    expect(token).toBe("pat-token");
  });

  test("returns undefined when no GitHub auth is configured", async () => {
    await expect(resolveGitHubToken({}, async () => new Response("{}"))).resolves.toBeUndefined();
  });

  test("mints an installation token from GitHub App settings", async () => {
    const requests: Array<{ url: string; authorization: string | null; method: string | undefined }> = [];

    const token = await resolveGitHubToken(
      {
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID: "456",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: createPrivateKey()
      },
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: input.toString(),
          authorization: new Headers(init?.headers).get("authorization"),
          method: init?.method
        });

        return new Response(JSON.stringify({ token: "installation-token" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }
    );

    expect(token).toBe("installation-token");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://api.github.com/app/installations/456/access_tokens",
      method: "POST"
    });
    expect(requests[0]?.authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
    expect(readJwtPayload(requests[0]?.authorization ?? "")).toMatchObject({ iss: "123" });
  });
});

function createPrivateKey(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem"
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem"
    }
  });

  return privateKey;
}

function readJwtPayload(authorization: string): Record<string, unknown> {
  const payload = authorization.replace(/^Bearer\s+/, "").split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}
