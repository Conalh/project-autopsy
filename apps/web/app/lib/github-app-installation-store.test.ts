import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { getGitHubAppSetup } from "./github-app-setup";
import {
  createPostgresGitHubAppInstallationStore,
  migratePostgresGitHubAppInstallationStore,
  readGitHubAppInstallation,
  saveGitHubAppInstallation,
  type PostgresQueryClient
} from "./github-app-installation-store";

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

  test("persists and reloads installation callback data from Postgres", async () => {
    const client = new FakePostgresClient();

    await migratePostgresGitHubAppInstallationStore(client);
    const store = createPostgresGitHubAppInstallationStore(client);
    const saved = await store.saveInstallation({
      installationId: "456",
      setupAction: "install"
    });

    expect(saved).toMatchObject({
      installationId: "456",
      setupAction: "install"
    });
    await expect(store.readInstallation()).resolves.toMatchObject({
      installationId: "456",
      setupAction: "install"
    });
    expect(client.queries[0]).toContain("CREATE TABLE IF NOT EXISTS github_app_installations");
  });
});

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
  queries: string[] = [];
  private row: InstallationRow | undefined;

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<{ rows: Row[] }> {
    this.queries.push(text);

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
