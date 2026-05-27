import { describe, expect, test } from "vitest";
import { getGitHubAppSetup, getGitHubAppSetupAsync } from "./github-app-setup";
import { createPostgresGitHubAppInstallationStore, type PostgresQueryClient } from "./github-app-installation-store";

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

  test("reports GitHub App mode from hosted installation storage", async () => {
    const client = new FakePostgresClient();
    await createPostgresGitHubAppInstallationStore(client).saveInstallation({ installationId: "789" });

    await expect(
      getGitHubAppSetupAsync(
        {
          PROJECT_AUTOPSY_GITHUB_APP_ID: "123",
          PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY: "private-key",
          PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example"
        },
        { postgresClient: client, migratePostgres: false }
      )
    ).resolves.toMatchObject({
      authMode: "github_app",
      readyForPrivateRepos: true,
      installationSource: "stored",
      missing: []
    });
  });
});

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
