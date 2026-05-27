import { afterEach, describe, expect, test } from "vitest";
import { verifyGitHubAppCallbackState } from "../../../lib/github-app-callback-state";
import { GET } from "./route";

describe("GitHub App install route", () => {
  afterEach(() => {
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG;
    delete process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET;
  });

  test("redirects to the configured GitHub App install URL", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";

    const response = await GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://github.com/apps/project-autopsy/installations/new");
  });

  test("adds signed callback state when a state secret is configured", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_SLUG = "project-autopsy";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_CALLBACK_STATE_SECRET = "state-secret";

    const response = await GET();
    const location = response.headers.get("location");
    const state = location ? new URL(location).searchParams.get("state") : undefined;

    expect(response.status).toBe(307);
    expect(location).toMatch(/^https:\/\/github\.com\/apps\/project-autopsy\/installations\/new\?state=/);
    expect(state).toBeTruthy();
    expect(verifyGitHubAppCallbackState(state ?? "", "state-secret")).toBe(true);
  });

  test("returns a setup error when no install URL can be built", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("GitHub App install URL is not configured.");
  });
});
