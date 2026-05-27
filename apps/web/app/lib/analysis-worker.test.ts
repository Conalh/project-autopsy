import { describe, expect, test } from "vitest";
import {
  createPostgresAnalysisJobStore,
  enqueueWebAnalysisJob,
  type PostgresQueryClient
} from "./analysis-queue";
import { processNextAnalysisJob } from "./analysis-worker";

describe("analysis worker", () => {
  test("claims and processes the next persisted queued analysis job", async () => {
    const client = new FakePostgresClient();

    const queued = await enqueueWebAnalysisJob(
      async () => {
        throw new Error("inline work should not run");
      },
      {
        env: {
          PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example/project-autopsy"
        },
        postgresClient: client,
        runInline: false,
        payload: {
          source: "https://github.com/acme/project",
          save: false,
          checkDependencyRegistry: true
        }
      }
    );

    const processed = await processNextAnalysisJob({
      postgresClient: client,
      inspect: async (payload) => ({
        report: {
          summary: {
            projectName: payload.source
          }
        }
      })
    });

    expect(processed).toMatchObject({
      id: queued.id,
      status: "completed",
      attempts: 1,
      result: {
        report: {
          summary: {
            projectName: "https://github.com/acme/project"
          }
        }
      }
    });
  });

  test("requeues failed worker attempts until max attempts is reached", async () => {
    const client = new FakePostgresClient();
    const store = createPostgresAnalysisJobStore(client);
    await store.createJob({
      id: "job_retry",
      status: "queued",
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      maxAttempts: 2,
      payload: {
        source: "https://github.com/acme/project",
        save: false,
        checkDependencyRegistry: false
      }
    });

    await expect(
      processNextAnalysisJob({
        postgresClient: client,
        inspect: async () => {
          throw new Error("temporary failure");
        }
      })
    ).resolves.toMatchObject({
      id: "job_retry",
      status: "queued",
      attempts: 1,
      error: "temporary failure"
    });

    await expect(
      processNextAnalysisJob({
        postgresClient: client,
        inspect: async () => {
          throw new Error("permanent failure");
        }
      })
    ).resolves.toMatchObject({
      id: "job_retry",
      status: "failed",
      attempts: 2,
      error: "permanent failure"
    });
  });
});

interface AnalysisJobRow {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  result_json: string | null;
  payload_json: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
}

class FakePostgresClient implements PostgresQueryClient {
  private rows = new Map<string, AnalysisJobRow>();

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<{ rows: Row[] }> {
    if (text.includes("INSERT INTO analysis_jobs")) {
      const row = {
        id: String(values[0]),
        status: String(values[1]),
        created_at: String(values[2]),
        updated_at: String(values[3]),
        result_json: values[4] === null || values[4] === undefined ? null : String(values[4]),
        payload_json: values[5] === null || values[5] === undefined ? null : String(values[5]),
        error: values[6] === null || values[6] === undefined ? null : String(values[6]),
        attempts: Number(values[7] ?? 0),
        max_attempts: Number(values[8] ?? 1)
      };
      this.rows.set(row.id, row);
      return { rows: [] };
    }

    if (text.includes("UPDATE analysis_jobs") && text.includes("status = 'running'")) {
      const queued = [...this.rows.values()]
        .filter((row) => row.status === "queued")
        .sort((left, right) => left.created_at.localeCompare(right.created_at))[0];
      if (!queued) {
        return { rows: [] };
      }
      const row = {
        ...queued,
        status: "running",
        updated_at: String(values[0]),
        attempts: queued.attempts + 1,
        error: null
      };
      this.rows.set(row.id, row);
      return { rows: [row as Row] };
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

    if (text.includes("SELECT") && text.includes("analysis_jobs")) {
      const row = this.rows.get(String(values[0]));
      return { rows: (row ? [row] : []) as Row[] };
    }

    return { rows: [] };
  }
}
