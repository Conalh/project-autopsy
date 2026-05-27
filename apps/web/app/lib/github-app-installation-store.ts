import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

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

export interface PostgresQueryClient {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export interface AsyncGitHubAppInstallationStore {
  readInstallation(): Promise<GitHubAppInstallation | undefined>;
  saveInstallation(input: SaveGitHubAppInstallationInput): Promise<GitHubAppInstallation>;
}

export interface WebGitHubAppInstallationStoreOptions {
  env?: GitHubAppInstallationEnv;
  path?: string;
  postgresClient?: PostgresQueryClient;
  migratePostgres?: boolean;
}

interface GitHubAppInstallationRow {
  installation_id: string;
  setup_action: string | null;
  updated_at: string;
}

export const POSTGRES_GITHUB_APP_INSTALLATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS github_app_installations (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  setup_action TEXT,
  updated_at TIMESTAMPTZ NOT NULL
);
`;

const DEFAULT_INSTALLATION_RECORD_ID = "default";
const migratedPostgresClients = new WeakSet<object>();
let cachedPostgresPool: Pool | undefined;
let cachedPostgresUrl: string | undefined;

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

export async function migratePostgresGitHubAppInstallationStore(client: PostgresQueryClient): Promise<void> {
  await client.query(POSTGRES_GITHUB_APP_INSTALLATION_SCHEMA);
}

export function createPostgresGitHubAppInstallationStore(
  client: PostgresQueryClient
): AsyncGitHubAppInstallationStore {
  return {
    async readInstallation() {
      const result = await client.query<GitHubAppInstallationRow>(
        `SELECT installation_id, setup_action, updated_at
        FROM github_app_installations
        WHERE id = $1`,
        [DEFAULT_INSTALLATION_RECORD_ID]
      );
      const row = result.rows[0];
      if (!row) {
        return undefined;
      }

      return {
        installationId: row.installation_id,
        ...(row.setup_action ? { setupAction: row.setup_action } : {}),
        updatedAt: new Date(row.updated_at).toISOString()
      };
    },

    async saveInstallation(input) {
      const installationId = normalize(input.installationId);
      if (!installationId) {
        throw new Error("GitHub App installation id is required.");
      }

      const setupAction = normalize(input.setupAction);
      const updatedAt = new Date().toISOString();

      await client.query(
        `INSERT INTO github_app_installations (
          id,
          installation_id,
          setup_action,
          updated_at
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          installation_id = EXCLUDED.installation_id,
          setup_action = EXCLUDED.setup_action,
          updated_at = EXCLUDED.updated_at`,
        [DEFAULT_INSTALLATION_RECORD_ID, installationId, setupAction ?? null, updatedAt]
      );

      return {
        installationId,
        ...(setupAction ? { setupAction } : {}),
        updatedAt
      };
    }
  };
}

export function createFileGitHubAppInstallationStore(
  options: GitHubAppInstallationStoreOptions = {}
): AsyncGitHubAppInstallationStore {
  return {
    async readInstallation() {
      return readGitHubAppInstallation(options);
    },
    async saveInstallation(input) {
      return saveGitHubAppInstallation(input, options);
    }
  };
}

export async function createWebGitHubAppInstallationStore(
  options: WebGitHubAppInstallationStoreOptions = {}
): Promise<AsyncGitHubAppInstallationStore> {
  const env = options.env ?? process.env;
  const postgresUrl = normalize(env.PROJECT_AUTOPSY_POSTGRES_URL) ?? normalize(env.DATABASE_URL);

  if (postgresUrl || options.postgresClient) {
    const client = options.postgresClient ?? createPostgresPool(postgresUrl);
    if (options.migratePostgres !== false && !migratedPostgresClients.has(client)) {
      await migratePostgresGitHubAppInstallationStore(client);
      migratedPostgresClients.add(client);
    }

    return createPostgresGitHubAppInstallationStore(client);
  }

  return createFileGitHubAppInstallationStore(options);
}

export async function readWebGitHubAppInstallation(
  options: WebGitHubAppInstallationStoreOptions = {}
): Promise<GitHubAppInstallation | undefined> {
  return (await createWebGitHubAppInstallationStore(options)).readInstallation();
}

export async function saveWebGitHubAppInstallation(
  input: SaveGitHubAppInstallationInput,
  options: WebGitHubAppInstallationStoreOptions = {}
): Promise<GitHubAppInstallation> {
  return (await createWebGitHubAppInstallationStore(options)).saveInstallation(input);
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

function createPostgresPool(connectionString: string | undefined): Pool {
  if (!connectionString) {
    throw new Error("PROJECT_AUTOPSY_POSTGRES_URL or DATABASE_URL is required for Postgres GitHub App installation storage.");
  }

  if (!cachedPostgresPool || cachedPostgresUrl !== connectionString) {
    cachedPostgresPool = new Pool({ connectionString });
    cachedPostgresUrl = connectionString;
  }

  return cachedPostgresPool;
}
