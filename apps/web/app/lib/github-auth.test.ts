import { generateKeyPairSync } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createPostgresGitHubAppInstallationStore,
  saveGitHubAppInstallation,
  type PostgresQueryClient
} from "./github-app-installation-store";
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

  test("mints an installation token from the stored GitHub App installation id", async () => {
    const requests: string[] = [];
    const filePath = await createStorePath();
    saveGitHubAppInstallation({ installationId: "789" }, { path: filePath });

    const token = await resolveGitHubToken(
      {
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH: filePath,
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: createPrivateKey()
      },
      async (input: string | URL | Request) => {
        requests.push(input.toString());

        return new Response(JSON.stringify({ token: "stored-installation-token" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      }
    );

    expect(token).toBe("stored-installation-token");
    expect(requests).toEqual(["https://api.github.com/app/installations/789/access_tokens"]);
  });

  test("mints an installation token from hosted GitHub App installation storage", async () => {
    const requests: string[] = [];
    const client = new FakePostgresClient();
    await createPostgresGitHubAppInstallationStore(client).saveInstallation({ installationId: "987" });

    const token = await resolveGitHubToken(
      {
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: createPrivateKey(),
        PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example"
      },
      async (input: string | URL | Request) => {
        requests.push(input.toString());

        return new Response(JSON.stringify({ token: "hosted-installation-token" }), {
          status: 201,
          headers: { "content-type": "application/json" }
        });
      },
      { postgresClient: client, migratePostgres: false }
    );

    expect(token).toBe("hosted-installation-token");
    expect(requests).toEqual(["https://api.github.com/app/installations/987/access_tokens"]);
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

async function createStorePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "project-autopsy-gh-app-"));
  return path.join(directory, "installation.json");
}

interface InstallationRow {
  id: string;
  installation_id: string;
  setup_action: string | null;
  updated_at: string;
}

class FakePostgresClient implements PostgresQueryClient {
  private row: InstallationRow | undefined;

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<{ rows: Row[] }> {
    if (text.includes("INSERT INTO github_app_installations")) {
      this.row = {
        id: String(values[0]),
        installation_id: String(values[1]),
        setup_action: typeof values[2] === "string" ? values[2] : null,
        updated_at: String(values[3])
      };
    }

    if (text.includes("SELECT") && text.includes("github_app_installations")) {
      return { rows: (this.row ? [this.row] : []) as Row[] };
    }

    return { rows: [] };
  }
}
