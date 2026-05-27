import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { getGitHubAppSetup } from "./github-app-setup";
import { readGitHubAppInstallation, saveGitHubAppInstallation } from "./github-app-installation-store";

describe("GitHub App installation store", () => {
  test("persists and reloads installation callback data", async () => {
    const filePath = await createStorePath();

    const saved = saveGitHubAppInstallation(
      {
        installationId: "456",
        setupAction: "install"
      },
      { path: filePath }
    );

    expect(saved).toMatchObject({
      installationId: "456",
      setupAction: "install"
    });
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readGitHubAppInstallation({ path: filePath })).toMatchObject({
      installationId: "456",
      setupAction: "install"
    });
  });

  test("uses stored installation id when env id is absent", async () => {
    const filePath = await createStorePath();
    saveGitHubAppInstallation({ installationId: "456" }, { path: filePath });

    expect(
      getGitHubAppSetup({
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY_PATH: "C:\\keys\\app.pem",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH: filePath
      })
    ).toMatchObject({
      authMode: "github_app",
      readyForPrivateRepos: true,
      installationSource: "stored",
      missing: []
    });
  });

  test("prefers env installation id over stored installation id", async () => {
    const filePath = await createStorePath();
    saveGitHubAppInstallation({ installationId: "stored" }, { path: filePath });

    expect(
      getGitHubAppSetup({
        PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID: "env",
        PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: "private-key",
        PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH: filePath
      })
    ).toMatchObject({
      authMode: "github_app",
      readyForPrivateRepos: true,
      installationSource: "env",
      missing: []
    });
  });
});

async function createStorePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "project-autopsy-gh-app-"));
  return path.join(directory, "installation.json");
}
