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
      result: {
        report: {
          summary: {
            projectName: "Hosted Queue"
          }
        }
      }
    });
  });
});

interface AnalysisJobRow {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  result_json: string | null;
  error: string | null;
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
        error: values[5] === null || values[5] === undefined ? null : String(values[5])
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
        error: values[4] === undefined ? existing.error : values[4] === null ? null : String(values[4])
      };
      this.rows.set(row.id, row);
      return { rows: [row as Row] };
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
