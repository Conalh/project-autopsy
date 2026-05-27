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

    expect(
      buildOperationsSummary(jobs, "postgres", {
        now: "2026-05-27T07:10:00.000Z"
      })
    ).toEqual({
      storageMode: "postgres",
      total: 4,
      latestUpdatedAt: "2026-05-27T08:00:00.000Z",
      counts: {
        queued: 1,
        running: 1,
        completed: 1,
        failed: 1
      },
      alerts: [
        {
          level: "critical",
          title: "Failed jobs need review",
          detail: "1 recent analysis job failed."
        }
      ]
    });
  });

  test("raises critical alerts for failed and stale running jobs", () => {
    const jobs: AnalysisJob[] = [
      createJob("job_failed", "failed", "2026-05-27T08:00:00.000Z", "analysis failed"),
      createJob("job_running", "running", "2026-05-27T07:00:00.000Z")
    ];

    expect(
      buildOperationsSummary(jobs, "postgres", {
        now: "2026-05-27T08:00:00.000Z",
        staleRunningMinutes: 30,
        queuedWarningThreshold: 5
      }).alerts
    ).toEqual([
      {
        level: "critical",
        title: "Failed jobs need review",
        detail: "1 recent analysis job failed."
      },
      {
        level: "critical",
        title: "Running jobs may be stuck",
        detail: "1 running job has not updated in at least 30 minutes."
      }
    ]);
  });

  test("raises a warning when queued jobs exceed the backlog threshold", () => {
    const jobs: AnalysisJob[] = [
      createJob("job_1", "queued", "2026-05-27T08:00:00.000Z"),
      createJob("job_2", "queued", "2026-05-27T08:00:00.000Z"),
      createJob("job_3", "queued", "2026-05-27T08:00:00.000Z")
    ];

    expect(
      buildOperationsSummary(jobs, "memory", {
        now: "2026-05-27T08:00:00.000Z",
        staleRunningMinutes: 30,
        queuedWarningThreshold: 2
      }).alerts
    ).toEqual([
      {
        level: "warning",
        title: "Queue backlog is building",
        detail: "3 jobs are waiting for a worker."
      }
    ]);
  });
});

function createJob(id: string, status: AnalysisJob["status"], updatedAt: string, error?: string): AnalysisJob {
  return {
    id,
    status,
    createdAt: updatedAt,
    updatedAt,
    ...(error ? { error } : {})
  };
}
