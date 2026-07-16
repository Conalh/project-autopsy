import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createStoredGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import { createFileGitHubAppInstallationStore } from "../../../lib/github-app-installation-store";
import { GET } from "./route";

const ENV_KEYS = [
  "PROJECT_AUTOPSY_GITHUB_APP_ID",
  "PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID",
  "PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH",
  "PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY",
  "PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET"
];

describe("GitHub App callback route", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  test("stores the installation id from GitHub's callback", async () => {
    const filePath = await createStorePath();
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH = filePath;
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";
    const state = await issuedState(filePath);

    const response = await GET(
      new Request(
        `http://localhost/api/github-app/callback?installation_id=456&setup_action=install&state=${encodeURIComponent(state)}`
      )
    );
    const body = await response.json();
    const stored = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(stored).toMatchObject({
      installationId: "456",
      setupAction: "install"
    });
    expect(body.githubApp).toMatchObject({
      authMode: "github_app",
      readyForPrivateRepos: true,
      installationSource: "stored",
      missing: []
    });
    expect(body.installation).toMatchObject({
      installationId: "456",
      setupAction: "install"
    });
  });

  test("requires a callback state secret before persisting private-capable installations", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "private-key";

    const response = await GET(new Request("http://localhost/api/github-app/callback?installation_id=456"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");
  });

  test("returns a setup error when installation id is missing", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";
    const response = await GET(new Request("http://localhost/api/github-app/callback?setup_action=install"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("GitHub App callback must include a numeric installation_id.");
  });

  test("requires callback state protection to be configured", async () => {
    const response = await GET(new Request("http://localhost/api/github-app/callback?installation_id=456"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");
  });

  test("requires signed callback state when a state secret is configured", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";

    const response = await GET(new Request("http://localhost/api/github-app/callback?installation_id=456"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("GitHub App callback state is required.");
  });

  test("rejects invalid signed callback state", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";

    const response = await GET(
      new Request("http://localhost/api/github-app/callback?installation_id=456&state=invalid-state")
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("GitHub App callback state is invalid or expired.");
  });

  test("accepts valid signed callback state", async () => {
    const filePath = await createStorePath();
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH = filePath;
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";
    const state = await issuedState(filePath);

    const response = await GET(
      new Request(`http://localhost/api/github-app/callback?installation_id=456&state=${encodeURIComponent(state)}`)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.githubApp).toMatchObject({
      authMode: "github_app",
      readyForPrivateRepos: true
    });
  });

  test("rejects replayed callback state", async () => {
    const filePath = await createStorePath();
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH = filePath;
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";
    const state = await issuedState(filePath);

    const url = `http://localhost/api/github-app/callback?installation_id=456&state=${encodeURIComponent(state)}`;
    const first = await GET(new Request(url));
    const replay = await GET(new Request(url));
    const replayBody = await replay.json();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(400);
    expect(replayBody.error).toBe("GitHub App callback state is invalid or expired.");
  });
});

async function createStorePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "project-autopsy-gh-app-"));
  return path.join(directory, "installation.json");
}

async function issuedState(filePath: string): Promise<string> {
  return createStoredGitHubAppCallbackState(
    "state-secret",
    createFileGitHubAppInstallationStore({ path: filePath })
  );
}
