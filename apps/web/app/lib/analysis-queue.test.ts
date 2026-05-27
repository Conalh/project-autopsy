import { describe, expect, test } from "vitest";
import {
  clearAnalysisJobs,
  enqueueAnalysisJob,
  getAnalysisJob,
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
});
