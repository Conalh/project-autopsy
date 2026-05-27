import { describe, expect, test } from "vitest";
import { summarizeGitHubAppSetup } from "./github-app-ui";

describe("GitHub App UI summary", () => {
  test("summarizes ready GitHub App setup", () => {
    expect(
      summarizeGitHubAppSetup({
        authMode: "github_app",
        readyForPrivateRepos: true,
        installationSource: "stored",
        missing: []
      })
    ).toEqual({
      label: "GitHub App ready",
      detail: "Private repository inspections can use the stored installation.",
      tone: "ok",
      actionHref: "/api/github-app/status",
      actionLabel: "View status"
    });
  });

  test("summarizes install-required setup with action", () => {
    expect(
      summarizeGitHubAppSetup({
        authMode: "github_app_install_required",
        readyForPrivateRepos: false,
        installUrl: "https://github.com/apps/project-autopsy/installations/new",
        missing: ["PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID"]
      })
    ).toEqual({
      label: "GitHub App install needed",
      detail: "Missing PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID.",
      tone: "warning",
      actionHref: "/api/github-app/install",
      actionLabel: "Install app"
    });
  });

  test("summarizes token mode", () => {
    expect(
      summarizeGitHubAppSetup({
        authMode: "token",
        readyForPrivateRepos: true,
        missing: []
      })
    ).toMatchObject({
      label: "Token auth ready",
      tone: "ok"
    });
  });
});
