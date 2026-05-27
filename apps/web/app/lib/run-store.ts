import path from "node:path";
import { existsSync } from "node:fs";
import { Pool } from "pg";
import {
  createPostgresRunStore,
  createSqliteRunStore,
  migratePostgresRunStore,
  type AnalysisRunStore,
  type AsyncAnalysisRunStore,
  type PostgresQueryClient
} from "@project-autopsy/core";

type WebRunStore = AnalysisRunStore | AsyncAnalysisRunStore;

interface WebRunStoreOptions {
  env?: Record<string, string | undefined>;
  postgresClient?: PostgresQueryClient;
  workspaceStart?: string;
  migratePostgres?: boolean;
}

const migratedPostgresClients = new WeakSet<object>();
let cachedPostgresPool: Pool | undefined;
let cachedPostgresUrl: string | undefined;

export async function createWebRunStore(options: WebRunStoreOptions = {}): Promise<WebRunStore> {
  const env = options.env ?? process.env;
  const postgresUrl = readEnv(env, "PROJECT_AUTOPSY_POSTGRES_URL") ?? readEnv(env, "DATABASE_URL");

  if (postgresUrl || options.postgresClient) {
    const client = options.postgresClient ?? createPostgresPool(postgresUrl);
    if (options.migratePostgres !== false && !migratedPostgresClients.has(client)) {
      await migratePostgresRunStore(client);
      migratedPostgresClients.add(client);
    }

    return createPostgresRunStore(client);
  }

  const dbPath = readEnv(env, "PROJECT_AUTOPSY_RUN_DB_PATH");
  if (dbPath) {
    return createSqliteRunStore(dbPath);
  }

  return createSqliteRunStore(path.join(findWorkspaceRoot(options.workspaceStart), ".project-autopsy", "runs.sqlite"));
}

function createPostgresPool(connectionString: string | undefined): Pool {
  if (!connectionString) {
    throw new Error("PROJECT_AUTOPSY_POSTGRES_URL or DATABASE_URL is required for Postgres run storage.");
  }

  if (!cachedPostgresPool || cachedPostgresUrl !== connectionString) {
    cachedPostgresPool = new Pool({ connectionString });
    cachedPostgresUrl = connectionString;
  }

  return cachedPostgresPool;
}

function readEnv(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function findWorkspaceRoot(start = process.cwd()): string {
  let current = start;

  while (true) {
    if (existsSync(path.join(current, "fixtures")) && existsSync(path.join(current, "packages"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}
