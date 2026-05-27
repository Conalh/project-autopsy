import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { POST } from "./route";
import { clearAnalysisJobs, waitForAnalysisJob } from "../../../lib/analysis-queue";
import { GET as getJob } from "../../jobs/[id]/route";
import { GET as getRun } from "../../runs/[id]/route";
import { GET as exportMarkdown } from "../../runs/[id]/export.md/route";

const fixturePath = path.resolve("../../fixtures/stalled-npm-app");

describe("hosted API routes", () => {
  test("inspects a repository and returns the core report contract", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/repositories/inspect", {
        source: fixturePath
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.summary.projectName).toBe("Stalled Notes App");
    expect(body.report.verdict.status).toBe("at-risk");
    expect(body.report.findings[0].id).toMatch(/^FINDING-/);
  });

  test("can save an inspection and read it back through run routes", async () => {
    process.env.PROJECT_AUTOPSY_RUN_DB_PATH = path.join(
      await mkdtemp(path.join(tmpdir(), "project-autopsy-api-")),
      "runs.sqlite"
    );

    try {
      const inspected = await POST(
        jsonRequest("http://localhost/api/repositories/inspect", {
          source: fixturePath,
          save: true
        })
      );
      const inspectedBody = await inspected.json();

      const loaded = await getRun(new Request(`http://localhost/api/runs/${inspectedBody.run.id}`), {
        params: Promise.resolve({ id: inspectedBody.run.id })
      });
      const loadedBody = await loaded.json();
      const exported = await exportMarkdown(
        new Request(`http://localhost/api/runs/${inspectedBody.run.id}/export.md`),
        {
          params: Promise.resolve({ id: inspectedBody.run.id })
        }
      );

      expect(inspected.status).toBe(200);
      expect(inspectedBody.run.id).toMatch(/^run_/);
      expect(loaded.status).toBe(200);
      expect(loadedBody.run.report.summary.projectName).toBe("Stalled Notes App");
      expect(exported.status).toBe(200);
      expect(await exported.text()).toContain("# Project Autopsy: Stalled Notes App");
    } finally {
      delete process.env.PROJECT_AUTOPSY_RUN_DB_PATH;
    }
  });

  test("queues an inspection and exposes job status", async () => {
    clearAnalysisJobs();
    process.env.PROJECT_AUTOPSY_RUN_DB_PATH = path.join(
      await mkdtemp(path.join(tmpdir(), "project-autopsy-api-queue-")),
      "runs.sqlite"
    );

    try {
      const queued = await POST(
        jsonRequest("http://localhost/api/repositories/inspect", {
          source: fixturePath,
          save: true,
          queue: true
        })
      );
      const queuedBody = await queued.json();
      await waitForAnalysisJob(queuedBody.job.id);
      const status = await getJob(new Request(`http://localhost/api/jobs/${queuedBody.job.id}`), {
        params: Promise.resolve({ id: queuedBody.job.id })
      });
      const statusBody = await status.json();

      expect(queued.status).toBe(202);
      expect(queuedBody.job.id).toMatch(/^job_/);
      expect(status.status).toBe(200);
      expect(statusBody.job.status).toBe("completed");
      expect(statusBody.job.result.report.summary.projectName).toBe("Stalled Notes App");
      expect(statusBody.job.result.run.id).toMatch(/^run_/);
    } finally {
      delete process.env.PROJECT_AUTOPSY_RUN_DB_PATH;
      clearAnalysisJobs();
    }
  });

  test("returns validation errors for malformed inspect requests", async () => {
    const response = await POST(
      jsonRequest("http://localhost/api/repositories/inspect", {
        branch: "main"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Request body must include a non-empty source string.");
  });

  test("returns JSON errors for invalid GitHub App configuration", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID = "456";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "not-a-private-key";

    try {
      const response = await POST(
        jsonRequest("http://localhost/api/repositories/inspect", {
          source: fixturePath
        })
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toMatch(/DECODER|PEM|unsupported/i);
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY;
    }
  });
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
