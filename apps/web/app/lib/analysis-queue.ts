import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed";

export interface AnalysisJob<Result = unknown> {
  id: string;
  status: AnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
  attempts?: number;
  maxAttempts?: number;
  payload?: unknown;
  result?: Result;
  error?: string;
}

interface InternalAnalysisJob<Result> extends AnalysisJob<Result> {
  done: Promise<AnalysisJob<Result>>;
  resolveDone: (job: AnalysisJob<Result>) => void;
}

export interface PostgresQueryClient {
  query<Row = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: Row[] }>;
}

export interface AnalysisJobStore {
  createJob<Result = unknown>(job: AnalysisJob<Result>): Promise<AnalysisJob<Result>>;
  getJob<Result = unknown>(id: string): Promise<AnalysisJob<Result> | undefined>;
  listJobs(limit?: number): Promise<AnalysisJob[]>;
  claimNextQueuedJob<Payload = unknown>(): Promise<AnalysisJob<unknown> & { payload?: Payload } | undefined>;
  updateJob<Result = unknown>(
    id: string,
    patch: Pick<AnalysisJob<Result>, "status"> & Partial<Pick<AnalysisJob<Result>, "attempts" | "result" | "error">>
  ): Promise<AnalysisJob<Result> | undefined>;
  cleanupTerminalJobs(options: { olderThan: string }): Promise<number>;
}

export interface WebAnalysisJobQueueOptions {
  env?: Record<string, string | undefined>;
  postgresClient?: PostgresQueryClient;
  migratePostgres?: boolean;
  payload?: unknown;
  runInline?: boolean;
}

interface AnalysisJobRow {
  id: string;
  status: AnalysisJobStatus;
  created_at: string;
  updated_at: string;
  result_json: string | Record<string, unknown> | null;
  payload_json: string | Record<string, unknown> | null;
  error: string | null;
  attempts: number | null;
  max_attempts: number | null;
}

export const POSTGRES_ANALYSIS_JOB_SCHEMA = `
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  result_json JSONB,
  payload_json JSONB,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS payload_json JSONB;

ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE analysis_jobs
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_updated_at
  ON analysis_jobs(updated_at DESC);
`;

const jobs = new Map<string, InternalAnalysisJob<unknown>>();
const migratedPostgresClients = new WeakSet<object>();
let cachedPostgresPool: Pool | undefined;
let cachedPostgresUrl: string | undefined;

export function enqueueAnalysisJob<Result>(work: () => Promise<Result>): AnalysisJob<Result> {
  const id = `job_${randomUUID()}`;
  const now = new Date().toISOString();
  let resolveDone: (job: AnalysisJob<Result>) => void = () => undefined;
  const done = new Promise<AnalysisJob<Result>>((resolve) => {
    resolveDone = resolve;
  });
  const job: InternalAnalysisJob<Result> = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    done,
    resolveDone
  };
  jobs.set(id, job as InternalAnalysisJob<unknown>);

  void runJob(job, work);

  return serializeJob(job);
}

export function getAnalysisJob<Result = unknown>(id: string): AnalysisJob<Result> | undefined {
  const job = jobs.get(id);
  return job ? serializeJob(job as InternalAnalysisJob<Result>) : undefined;
}

export function listAnalysisJobs(limit?: number): AnalysisJob[] {
  const normalizedLimit = normalizeListLimit(limit);
  return [...jobs.values()]
    .map((job) => serializeJob(job))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, normalizedLimit);
}

export async function waitForAnalysisJob<Result = unknown>(id: string): Promise<AnalysisJob<Result>> {
  const job = jobs.get(id);
  if (!job) {
    throw new Error(`Analysis job not found: ${id}`);
  }

  if (job.status === "completed" || job.status === "failed") {
    return serializeJob(job as InternalAnalysisJob<Result>);
  }

  return (await job.done) as AnalysisJob<Result>;
}

export function clearAnalysisJobs(): void {
  jobs.clear();
}

export async function migratePostgresAnalysisJobStore(client: PostgresQueryClient): Promise<void> {
  await client.query(POSTGRES_ANALYSIS_JOB_SCHEMA);
}

export function createPostgresAnalysisJobStore(client: PostgresQueryClient): AnalysisJobStore {
  return {
    async createJob(job) {
      await client.query(
        `INSERT INTO analysis_jobs (
          id,
          status,
          created_at,
          updated_at,
          result_json,
          payload_json,
          error,
          attempts,
          max_attempts
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
        [
          job.id,
          job.status,
          job.createdAt,
          job.updatedAt,
          job.result === undefined ? null : JSON.stringify(job.result),
          job.payload === undefined ? null : JSON.stringify(job.payload),
          job.error ?? null,
          job.attempts ?? 0,
          normalizeMaxAttempts(job.maxAttempts)
        ]
      );

      return job;
    },

    async getJob(id) {
      const result = await client.query<AnalysisJobRow>(
        `SELECT id, status, created_at, updated_at, result_json, payload_json, error, attempts, max_attempts
        FROM analysis_jobs
        WHERE id = $1`,
        [id]
      );
      const row = result.rows[0];
      return row ? toAnalysisJob(row) : undefined;
    },

    async listJobs(limit = 20) {
      const result = await client.query<AnalysisJobRow>(
        `SELECT id, status, created_at, updated_at, result_json, payload_json, error, attempts, max_attempts
        FROM analysis_jobs
        ORDER BY updated_at DESC
        LIMIT $1`,
        [normalizeListLimit(limit)]
      );

      return result.rows.map((row) => toAnalysisJob(row));
    },

    async claimNextQueuedJob<Payload = unknown>() {
      const updatedAt = new Date().toISOString();
      const result = await client.query<AnalysisJobRow>(
        `UPDATE analysis_jobs
        SET
          status = 'running',
          updated_at = $1,
          attempts = attempts + 1,
          error = NULL
        WHERE id = (
          SELECT id
          FROM analysis_jobs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, status, created_at, updated_at, result_json, payload_json, error, attempts, max_attempts`,
        [updatedAt]
      );
      const row = result.rows[0];
      return row ? (toAnalysisJob(row) as AnalysisJob<unknown> & { payload?: Payload }) : undefined;
    },

    async updateJob(id, patch) {
      const updatedAt = new Date().toISOString();
      const result = await client.query<AnalysisJobRow>(
        `UPDATE analysis_jobs
        SET
          status = $2,
          updated_at = $3,
          result_json = $4::jsonb,
          error = $5,
          attempts = $6
        WHERE id = $1
        RETURNING id, status, created_at, updated_at, result_json, payload_json, error, attempts, max_attempts`,
        [
          id,
          patch.status,
          updatedAt,
          patch.result === undefined ? null : JSON.stringify(patch.result),
          patch.error ?? null,
          patch.attempts ?? 0
        ]
      );
      const row = result.rows[0];
      return row ? toAnalysisJob(row) : undefined;
    },

    async cleanupTerminalJobs(options) {
      const result = await client.query<{ deleted_count: number | string }>(
        `WITH deleted AS (
          DELETE FROM analysis_jobs
          WHERE status IN ('completed', 'failed')
            AND updated_at < $1
          RETURNING 1
        )
        SELECT count(*)::int AS deleted_count FROM deleted`,
        [options.olderThan]
      );

      return Number(result.rows[0]?.deleted_count ?? 0);
    }
  };
}

export async function enqueueWebAnalysisJob<Result>(
  work: () => Promise<Result>,
  options: WebAnalysisJobQueueOptions = {}
): Promise<AnalysisJob<Result>> {
  const store = await createWebAnalysisJobStore(options);
  if (!store) {
    return enqueueAnalysisJob(work);
  }

  const now = new Date().toISOString();
  const job: AnalysisJob<Result> = {
    id: `job_${randomUUID()}`,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    maxAttempts: readMaxAttempts(options.env ?? process.env),
    ...(options.payload === undefined ? {} : { payload: options.payload })
  };
  await store.createJob(job);

  if (options.runInline !== false) {
    void runStoredJob(job.id, work, store);
  }

  return job;
}

export async function getWebAnalysisJob<Result = unknown>(
  id: string,
  options: WebAnalysisJobQueueOptions = {}
): Promise<AnalysisJob<Result> | undefined> {
  const store = await createWebAnalysisJobStore(options);
  return store ? store.getJob<Result>(id) : getAnalysisJob<Result>(id);
}

export async function listWebAnalysisJobs(
  limit?: number,
  options: WebAnalysisJobQueueOptions = {}
): Promise<AnalysisJob[]> {
  const store = await createWebAnalysisJobStore(options);
  return store ? store.listJobs(limit) : listAnalysisJobs(limit);
}

async function runJob<Result>(job: InternalAnalysisJob<Result>, work: () => Promise<Result>): Promise<void> {
  updateJob(job, { status: "running" });

  try {
    const result = await work();
    updateJob(job, { status: "completed", result });
  } catch (error) {
    updateJob(job, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    job.resolveDone(serializeJob(job));
  }
}

function updateJob<Result>(job: InternalAnalysisJob<Result>, patch: Partial<AnalysisJob<Result>>): void {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

function serializeJob<Result>(job: InternalAnalysisJob<Result>): AnalysisJob<Result> {
  const { done: _done, resolveDone: _resolveDone, ...serialized } = job;
  return serialized;
}

async function runStoredJob<Result>(
  id: string,
  work: () => Promise<Result>,
  store: AnalysisJobStore
): Promise<void> {
  const initialJob = await store.getJob(id);
  const maxAttempts = normalizeMaxAttempts(initialJob?.maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await store.updateJob(id, { status: "running", attempts: attempt });

    try {
      const result = await work();
      await store.updateJob(id, { status: "completed", attempts: attempt, result });
      return;
    } catch (error) {
      if (attempt >= maxAttempts) {
        await store.updateJob(id, {
          status: "failed",
          attempts: attempt,
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
    }
  }
}

export async function createWebAnalysisJobStore(
  options: WebAnalysisJobQueueOptions
): Promise<AnalysisJobStore | undefined> {
  const env = options.env ?? process.env;
  const postgresUrl = readEnv(env, "PROJECT_AUTOPSY_POSTGRES_URL") ?? readEnv(env, "DATABASE_URL");

  if (!postgresUrl && !options.postgresClient) {
    return undefined;
  }

  const client = options.postgresClient ?? createPostgresPool(postgresUrl);
  if (options.migratePostgres !== false && !migratedPostgresClients.has(client)) {
    await migratePostgresAnalysisJobStore(client);
    migratedPostgresClients.add(client);
  }

  return createPostgresAnalysisJobStore(client);
}

function toAnalysisJob<Result = unknown>(row: AnalysisJobRow): AnalysisJob<Result> {
  return {
    id: row.id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    attempts: row.attempts ?? 0,
    maxAttempts: normalizeMaxAttempts(row.max_attempts ?? undefined),
    ...(row.payload_json === null ? {} : { payload: readResultJson(row.payload_json) }),
    ...(row.result_json === null ? {} : { result: readResultJson<Result>(row.result_json) }),
    ...(row.error ? { error: row.error } : {})
  };
}

function readResultJson<Result>(resultJson: string | Record<string, unknown>): Result {
  return (typeof resultJson === "string" ? JSON.parse(resultJson) : resultJson) as Result;
}

function createPostgresPool(connectionString: string | undefined): Pool {
  if (!connectionString) {
    throw new Error("PROJECT_AUTOPSY_POSTGRES_URL or DATABASE_URL is required for Postgres analysis job storage.");
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

function readMaxAttempts(env: Record<string, string | undefined>): number {
  const configured = Number.parseInt(readEnv(env, "PROJECT_AUTOPSY_ANALYSIS_JOB_MAX_ATTEMPTS") ?? "", 10);
  return normalizeMaxAttempts(Number.isFinite(configured) ? configured : undefined);
}

function normalizeMaxAttempts(value: number | undefined): number {
  return value && value > 0 ? Math.floor(value) : 1;
}

function normalizeListLimit(value: number | undefined): number {
  return value && value > 0 ? Math.floor(value) : 20;
}
