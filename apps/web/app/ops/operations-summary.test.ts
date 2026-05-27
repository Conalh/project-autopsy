import { describe, expect, test } from "vitest";
import type { AnalysisJob } from "../lib/analysis-queue";
import { buildOperationsSummary } from "./operations-summary";

describe("operations summary", () => {
  test("counts jobs by status and reports the latest update", () => {
    const jobs: AnalysisJob[] = [
      createJob("job_queued", "queued", "2026-05-27T06:00:00.000Z"),
      createJob("job_running", "running", "2026-05-27T07:00:00.000Z"),
      createJob("job_completed", "completed", "2026-05-27T08:00:00.000Z"),
      createJob("job_failed", "failed", "2026-05-27T05:00:00.000Z")
    ];

    expect(buildOperationsSummary(jobs, "postgres")).toEqual({
      storageMode: "postgres",
      total: 4,
      latestUpdatedAt: "2026-05-27T08:00:00.000Z",
      counts: {
        queued: 1,
        running: 1,
        completed: 1,
        failed: 1
      }
    });
  });
});

function createJob(id: string, status: AnalysisJob["status"], updatedAt: string): AnalysisJob {
  return {
    id,
    status,
    createdAt: updatedAt,
    updatedAt
  };
}
