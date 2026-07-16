import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { verifyGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import { GET } from "./route";

describe("GitHub App install route", () => {
  afterEach(() => {
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG;
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_ID;
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY;
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH;
    delete process.env.PROJECT_AUTOPSY_ADMIN_TOKEN;
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET;
  });

  test("requires a callback state secret before redirecting", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";

    const response = await GET(new Request("http://localhost/api/github-app/install"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");
  });

  test("adds signed callback state when a state secret is configured", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH = await createStorePath();
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";

    const response = await GET(new Request("http://localhost/api/github-app/install"));
    const location = response.headers.get("location");
    const state = location ? new URL(location).searchParams.get("state") : undefined;

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(location).toMatch(/^https:\/\/github\.com\/apps\/project-autopsy\/installations\/new\?state=/);
    expect(state).toBeTruthy();
    expect(verifyGitHubAppCallbackState(state ?? "", "state-secret")).toBe(true);
  });

  test("returns a setup error when no install URL can be built", async () => {
    const response = await GET(new Request("http://localhost/api/github-app/install"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("GitHub App install URL is not configured.");
  });

  test("requires admin auth and signed state setup when private-capable app credentials are configured", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "private-key";

    const missingAdmin = await GET(new Request("http://localhost/api/github-app/install"));
    const missingAdminBody = await missingAdmin.json();

    process.env.PROJECT_AUTOPSY_ADMIN_TOKEN = "admin-secret";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH = await createStorePath();
    const missingStateSecret = await GET(
      new Request("http://localhost/api/github-app/install", {
        headers: { authorization: "Bearer admin-secret" }
      })
    );
    const missingStateSecretBody = await missingStateSecret.json();

    expect(missingAdmin.status).toBe(503);
    expect(missingAdminBody.error).toContain("PROJECT_AUTOPSY_ADMIN_TOKEN");
    expect(missingStateSecret.status).toBe(503);
    expect(missingStateSecretBody.error).toContain("PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET");
  });

  test("rejects wrong admin credentials and redirects with correct credentials in private-capable mode", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "private-key";
    process.env.PROJECT_AUTOPSY_ADMIN_TOKEN = "admin-secret";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH = await createStorePath();

    const wrong = await GET(
      new Request("http://localhost/api/github-app/install", {
        headers: { authorization: "Bearer wrong" }
      })
    );
    const wrongBody = await wrong.json();
    const correct = await GET(
      new Request("http://localhost/api/github-app/install", {
        headers: { authorization: "Bearer admin-secret" }
      })
    );

    expect(wrong.status).toBe(401);
    expect(wrongBody.error).toBe("Admin token required.");
    expect(correct.status).toBe(307);
    expect(correct.headers.get("location")).toContain("state=");
  });
});

async function createStorePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "project-autopsy-gh-app-install-"));
  return path.join(directory, "installation.json");
}
