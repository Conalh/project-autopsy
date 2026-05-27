import { describe, expect, test } from "vitest";
import { getGitHubAppSetup } from "./github-app-setup";

describe("GitHub App setup", () => {
  test("reports personal access token mode when a token is configured", () => {
    expect(
      getGitHubAppSetup({
        PROJECT_AUTOPSY_GITHUB_TOKEN: "token"
      })
    ).toMatchObject({
      authMode: "token",
      readyForPrivateRepos: true,
      missing: []
    });
  });

  test("builds an installation URL from a GitHub App slug", () => {
    expect(
      getGitHubAppSetup({
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_SLUG: "project-autopsy",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH: "C:\\keys\\app.pem"
      })
    ).toMatchObject({
      authMode: "github_app_install_required",
      readyForPrivateRepos: false,
      installUrl: "https://github.com/apps/project-autopsy/installations/new",
      missing: ["PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID"]
    });
  });

  test("reports GitHub App mode when installation auth can mint tokens", () => {
    expect(
      getGitHubAppSetup({
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID: "456",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: "private-key"
      })
    ).toMatchObject({
      authMode: "github_app",
      readyForPrivateRepos: true,
      missing: []
    });
  });
});
