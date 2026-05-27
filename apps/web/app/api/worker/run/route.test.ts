import { afterEach, describe, expect, test, vi } from "vitest";

const processAnalysisWorkerBatch = vi.fn();

vi.mock("../../../lib/analysis-worker", () => ({
  processAnalysisWorkerBatch
}));

describe("worker run route", () => {
  afterEach(() => {
    delete process.env.PROJECT_AUTOPSY_ADMIN_TOKEN;
    processAnalysisWorkerBatch.mockReset();
  });

  test("requires the configured admin token", async () => {
    process.env.PROJECT_AUTOPSY_ADMIN_TOKEN = "secret-admin-token";
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ maxJobs: 2 }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Admin token required.");
    expect(processAnalysisWorkerBatch).not.toHaveBeenCalled();
  });

  test("runs a bounded worker batch for an authorized scheduler request", async () => {
    process.env.PROJECT_AUTOPSY_ADMIN_TOKEN = "secret-admin-token";
    processAnalysisWorkerBatch.mockResolvedValue({
      claimed: 2,
      completed: 1,
      failed: 0,
      requeued: 1,
      cleaned: 3,
      empty: false
    });
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest(
        {
          maxJobs: 2,
          cleanupTerminalJobsOlderThan: "2026-05-27T00:00:00.000Z"
        },
        {
          authorization: "Bearer secret-admin-token"
        }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processAnalysisWorkerBatch).toHaveBeenCalledWith({
      maxJobs: 2,
      cleanupTerminalJobsOlderThan: "2026-05-27T00:00:00.000Z"
    });
    expect(body).toEqual({
      worker: {
        claimed: 2,
        completed: 1,
        failed: 0,
        requeued: 1,
        cleaned: 3,
        empty: false
      }
    });
  });
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/worker/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}
