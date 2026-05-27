import { describe, expect, test } from "vitest";
import {
  clearAnalysisJobs,
  createPostgresAnalysisJobStore,
  enqueueAnalysisJob,
  enqueueWebAnalysisJob,
  getAnalysisJob,
  getWebAnalysisJob,
  migratePostgresAnalysisJobStore,
  type PostgresQueryClient,
  waitForAnalysisJob
} from "./analysis-queue";

describe("analysis job queue", () => {
  test("runs queued jobs and exposes completed results", async () => {
    clearAnalysisJobs();

    const queued = enqueueAnalysisJob(async () => ({ report: { summary: { projectName: "Queued Fixture" } } }));
    const completed = await waitForAnalysisJob<{ report: { summary: { projectName: string } } }>(queued.id);

    expect(queued.id).toMatch(/^job_/);
    expect(completed.status).toBe("completed");
    expect(completed.result?.report.summary.projectName).toBe("Queued Fixture");
    expect(getAnalysisJob(queued.id)?.status).toBe("completed");
  });

  test("stores failed job errors for status polling", async () => {
    clearAnalysisJobs();

    const queued = enqueueAnalysisJob(async () => {
      throw new Error("analysis failed");
    });
    const failed = await waitForAnalysisJob(queued.id);

    expect(failed).toMatchObject({
      id: queued.id,
      status: "failed",
      error: "analysis failed"
    });
  });

  test("persists queued job status and completed result in Postgres", async () => {
    const client = new FakePostgresClient();
    await migratePostgresAnalysisJobStore(client);
    const store = createPostgresAnalysisJobStore(client);

    const queued = await store.createJob({
      id: "job_123",
      status: "queued",
      createdAt: "2026-05-27T06:00:00.000Z",
      updatedAt: "2026-05-27T06:00:00.000Z"
    });
    await store.updateJob(queued.id, {
      status: "completed",
      result: { report: { summary: { projectName: "Durable Fixture" } } }
    });

    await expect(store.getJob<{ report: { summary: { projectName: string } } }>(queued.id)).resolves.toMatchObject({
      id: "job_123",
      status: "completed",
      result: {
        report: {
          summary: {
            projectName: "Durable Fixture"
          }
        }
      }
    });
    expect(client.queries[0]?.text).toContain("CREATE TABLE IF NOT EXISTS analysis_jobs");
  });

  test("uses durable Postgres storage for hosted queued jobs", async () => {
    const client = new FakePostgresClient();

    const queued = await enqueueWebAnalysisJob(
      async () => ({ report: { summary: { projectName: "Hosted Queue" } } }),
      {
        env: {
          PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example/project-autopsy"
        },
        postgresClient: client
      }
    );

    await waitFor(() => getWebAnalysisJob(queued.id, { postgresClient: client }));

    const completed = await getWebAnalysisJob<{ report: { summary: { projectName: string } } }>(queued.id, {
      postgresClient: client
    });

    expect(completed).toMatchObject({
      id: queued.id,
      status: "completed",
      attempts: 1,
      result: {
        report: {
          summary: {
            projectName: "Hosted Queue"
          }
        }
      }
    });
  });

  test("retries hosted queued jobs before marking them completed", async () => {
    const client = new FakePostgresClient();
    let attempts = 0;

    const queued = await enqueueWebAnalysisJob(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary failure");
        }

        return { report: { summary: { projectName: "Retried Queue" } } };
      },
      {
        env: {
          PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example/project-autopsy",
          PROJECT_AUTOPSY_ANALYSIS_JOB_MAX_ATTEMPTS: "2"
        },
        postgresClient: client
      }
    );

    await waitFor(() => getWebAnalysisJob(queued.id, { postgresClient: client }));

    await expect(getWebAnalysisJob(queued.id, { postgresClient: client })).resolves.toMatchObject({
      status: "completed",
      attempts: 2,
      result: {
        report: {
          summary: {
            projectName: "Retried Queue"
          }
        }
      }
    });
  });

  test("marks hosted queued jobs failed after max attempts", async () => {
    const client = new FakePostgresClient();

    const queued = await enqueueWebAnalysisJob(
      async () => {
        throw new Error("permanent failure");
      },
      {
        env: {
          PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example/project-autopsy",
          PROJECT_AUTOPSY_ANALYSIS_JOB_MAX_ATTEMPTS: "2"
        },
        postgresClient: client
      }
    );

    await waitFor(() => getWebAnalysisJob(queued.id, { postgresClient: client }));

    await expect(getWebAnalysisJob(queued.id, { postgresClient: client })).resolves.toMatchObject({
      status: "failed",
      attempts: 2,
      error: "permanent failure"
    });
  });

  test("cleans up terminal Postgres jobs older than the retention cutoff", async () => {
    const client = new FakePostgresClient();
    const store = createPostgresAnalysisJobStore(client);

    await store.createJob({
      id: "job_old",
      status: "completed",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });
    await store.createJob({
      id: "job_recent",
      status: "completed",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z"
    });
    await store.createJob({
      id: "job_running",
      status: "running",
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z"
    });

    await expect(store.cleanupTerminalJobs({ olderThan: "2026-05-26T00:00:00.000Z" })).resolves.toBe(1);
    await expect(store.getJob("job_old")).resolves.toBeUndefined();
    await expect(store.getJob("job_recent")).resolves.toMatchObject({ id: "job_recent" });
    await expect(store.getJob("job_running")).resolves.toMatchObject({ id: "job_running" });
  });
});

interface AnalysisJobRow {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  result_json: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
}

class FakePostgresClient implements PostgresQueryClient {
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];
  private rows = new Map<string, AnalysisJobRow>();

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<{ rows: Row[] }> {
    this.queries.push({ text, values });

    if (text.includes("INSERT INTO analysis_jobs")) {
      const row = {
        id: String(values[0]),
        status: String(values[1]),
        created_at: String(values[2]),
        updated_at: String(values[3]),
        result_json: values[4] === null || values[4] === undefined ? null : String(values[4]),
        error: values[5] === null || values[5] === undefined ? null : String(values[5]),
        attempts: Number(values[6] ?? 0),
        max_attempts: Number(values[7] ?? 1)
      };
      this.rows.set(row.id, row);
      return { rows: [] };
    }

    if (text.includes("UPDATE analysis_jobs")) {
      const existing = this.rows.get(String(values[0]));
      if (!existing) {
        return { rows: [] };
      }
      const row = {
        ...existing,
        status: String(values[1]),
        updated_at: String(values[2]),
        result_json: values[3] === undefined ? existing.result_json : values[3] === null ? null : String(values[3]),
        error: values[4] === undefined ? existing.error : values[4] === null ? null : String(values[4]),
        attempts: values[5] === undefined ? existing.attempts : Number(values[5])
      };
      this.rows.set(row.id, row);
      return { rows: [row as Row] };
    }

    if (text.includes("DELETE FROM analysis_jobs")) {
      const cutoff = String(values[0]);
      let count = 0;
      for (const [id, row] of [...this.rows.entries()]) {
        if ((row.status === "completed" || row.status === "failed") && row.updated_at < cutoff) {
          this.rows.delete(id);
          count += 1;
        }
      }

      return { rows: [{ deleted_count: count } as Row] };
    }

    if (text.includes("SELECT") && text.includes("analysis_jobs")) {
      const row = this.rows.get(String(values[0]));
      return { rows: (row ? [row] : []) as Row[] };
    }

    return { rows: [] };
  }
}

async function waitFor(readJob: () => Promise<{ status: string } | undefined>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = await readJob();
    if (job?.status === "completed" || job?.status === "failed") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error("Timed out waiting for durable job.");
}
