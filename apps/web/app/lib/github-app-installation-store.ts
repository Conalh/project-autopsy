import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type GitHubAppInstallationEnv = Record<string, string | undefined>;

export interface GitHubAppInstallation {
  installationId: string;
  setupAction?: string;
  updatedAt: string;
}

interface GitHubAppInstallationStoreOptions {
  env?: GitHubAppInstallationEnv;
  path?: string;
}

interface SaveGitHubAppInstallationInput {
  installationId: string;
  setupAction?: string;
}

export function defaultGitHubAppInstallationPath(): string {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ".project-autopsy", "github-app-installation.json");
}

export function readGitHubAppInstallation(
  options: GitHubAppInstallationStoreOptions = {}
): GitHubAppInstallation | undefined {
  const filePath = resolveInstallationPath(options);

  try {
    const body = JSON.parse(readFileSync(/*turbopackIgnore: true*/ filePath, "utf8")) as Partial<GitHubAppInstallation>;
    const installationId = normalize(body.installationId);
    if (!installationId) {
      return undefined;
    }

    const setupAction = normalize(body.setupAction);
    const updatedAt = normalize(body.updatedAt) ?? new Date(0).toISOString();

    return {
      installationId,
      ...(setupAction ? { setupAction } : {}),
      updatedAt
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    if (error instanceof SyntaxError) {
      return undefined;
    }

    throw error;
  }
}

export function saveGitHubAppInstallation(
  input: SaveGitHubAppInstallationInput,
  options: GitHubAppInstallationStoreOptions = {}
): GitHubAppInstallation {
  const installationId = normalize(input.installationId);
  if (!installationId) {
    throw new Error("GitHub App installation id is required.");
  }

  const setupAction = normalize(input.setupAction);
  const installation: GitHubAppInstallation = {
    installationId,
    ...(setupAction ? { setupAction } : {}),
    updatedAt: new Date().toISOString()
  };
  const filePath = resolveInstallationPath(options);

  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ filePath, `${JSON.stringify(installation, null, 2)}\n`, "utf8");

  return installation;
}

function resolveInstallationPath(options: GitHubAppInstallationStoreOptions): string {
  const env = options.env ?? process.env;

  return (
    normalize(options.path) ??
    normalize(env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_PATH) ??
    defaultGitHubAppInstallationPath()
  );
}

function normalize(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
