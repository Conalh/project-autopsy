import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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

interface GitHubAppCallbackStateNonceInput {
  nonce: string;
  expiresAt: string;
}

export interface PostgresQueryClient {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export interface AsyncGitHubAppInstallationStore {
  readInstallation(): Promise<GitHubAppInstallation | undefined>;
  saveInstallation(input: SaveGitHubAppInstallationInput): Promise<GitHubAppInstallation>;
  issueCallbackStateNonce(input: GitHubAppCallbackStateNonceInput): Promise<void>;
  consumeCallbackStateNonce(nonce: string, options?: { now?: Date }): Promise<boolean>;
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

CREATE TABLE IF NOT EXISTS github_app_callback_state_nonces (
  nonce_hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_app_callback_state_nonces_expires_at
  ON github_app_callback_state_nonces(expires_at);
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

export function issueGitHubAppCallbackStateNonce(
  input: GitHubAppCallbackStateNonceInput,
  options: GitHubAppInstallationStoreOptions = {}
): void {
  const nonceHash = hashNonce(input.nonce);
  const expiresAt = normalize(input.expiresAt);
  if (!nonceHash || !expiresAt) {
    throw new Error("GitHub App callback state nonce and expiry are required.");
  }

  const filePath = callbackStateNoncePath(nonceHash, options);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    /*turbopackIgnore: true*/ filePath,
    `${JSON.stringify({ nonceHash, expiresAt, createdAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

export function consumeGitHubAppCallbackStateNonce(
  nonce: string,
  options: GitHubAppInstallationStoreOptions & { now?: Date } = {}
): boolean {
  const nonceHash = hashNonce(nonce);
  if (!nonceHash) {
    return false;
  }

  const filePath = callbackStateNoncePath(nonceHash, options);
  let expiresAt: number;
  try {
    const body = JSON.parse(readFileSync(/*turbopackIgnore: true*/ filePath, "utf8")) as { expiresAt?: unknown };
    expiresAt = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : Number.NaN;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  const now = options.now?.getTime() ?? Date.now();
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    try {
      unlinkSync(/*turbopackIgnore: true*/ filePath);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    return false;
  }

  const consumedPath = `${filePath}.consumed-${process.pid}-${Date.now()}`;
  try {
    renameSync(/*turbopackIgnore: true*/ filePath, consumedPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "EEXIST")) {
      return false;
    }
    throw error;
  }

  try {
    unlinkSync(/*turbopackIgnore: true*/ consumedPath);
  } catch {
    // The nonce was still consumed by the atomic rename. Cleanup is best effort.
  }
  return true;
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
    },

    async issueCallbackStateNonce(input) {
      const nonceHash = hashNonce(input.nonce);
      const expiresAt = normalize(input.expiresAt);
      if (!nonceHash || !expiresAt) {
        throw new Error("GitHub App callback state nonce and expiry are required.");
      }

      await client.query(
        `INSERT INTO github_app_callback_state_nonces (
          nonce_hash,
          expires_at,
          created_at
        ) VALUES ($1, $2, $3)
        ON CONFLICT (nonce_hash) DO UPDATE SET
          expires_at = EXCLUDED.expires_at,
          created_at = EXCLUDED.created_at`,
        [nonceHash, expiresAt, new Date().toISOString()]
      );
    },

    async consumeCallbackStateNonce(nonce, options = {}) {
      const nonceHash = hashNonce(nonce);
      if (!nonceHash) {
        return false;
      }

      const result = await client.query<{ consumed_count: number | string }>(
        `WITH consumed AS (
          DELETE FROM github_app_callback_state_nonces
          WHERE nonce_hash = $1
            AND expires_at >= $2
          RETURNING nonce_hash
        )
        SELECT count(*)::int AS consumed_count FROM consumed`,
        [nonceHash, (options.now ?? new Date()).toISOString()]
      );

      return Number(result.rows[0]?.consumed_count ?? 0) > 0;
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
    },
    async issueCallbackStateNonce(input) {
      return issueGitHubAppCallbackStateNonce(input, options);
    },
    async consumeCallbackStateNonce(nonce, consumeOptions = {}) {
      return consumeGitHubAppCallbackStateNonce(nonce, { ...options, ...consumeOptions });
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

function callbackStateNoncePath(nonceHash: string, options: GitHubAppInstallationStoreOptions): string {
  return path.join(path.dirname(resolveInstallationPath(options)), "github-app-callback-state", `${nonceHash}.json`);
}

function normalize(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function hashNonce(nonce: string): string | undefined {
  const normalized = normalize(nonce);
  return normalized ? createHash("sha256").update(normalized, "utf8").digest("hex") : undefined;
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
