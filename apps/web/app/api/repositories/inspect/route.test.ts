import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { POST } from "./route";
import { clearAnalysisJobs, waitForAnalysisJob } from "../../../lib/analysis-queue";
import { GET as getJob } from "../../jobs/[id]/route";
import { GET as getRun } from "../../runs/[id]/route";
import { GET as exportMarkdown } from "../../runs/[id]/export.md/route";

const fixturePath = path.resolve("../../fixtures/stalled-npm-app");

describe("hosted API routes", () => {
  // The local fixtures are filesystem paths, so these tests run as if in a
  // development deployment with local inspection explicitly enabled.
  beforeAll(() => {
    process.env.PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS = "true";
  });

  afterAll(() => {
    delete process.env.PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS;
  });

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
    expect(body.report.snapshot.completeness.files.status).toBe("complete");
    expect(body.report.snapshot.files).toEqual([]);
    expect(body.report.snapshot.docs.every((doc: { content: string }) => doc.content === "")).toBe(true);
    expect(body.report.snapshot.manifests.every((manifest: { parsed: Record<string, unknown> }) => Object.keys(manifest.parsed).length === 0)).toBe(true);
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
      expect(loadedBody.run.report.snapshot.completeness.files.status).toBe("complete");
      expect(exported.status).toBe(200);
      const markdown = await exported.text();
      expect(markdown).toContain("# Project Autopsy: Stalled Notes App");
      expect(markdown).toContain("## Inspection Completeness");
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
      expect(statusBody.job.result.report.snapshot.completeness.files.status).toBe("complete");
      expect(statusBody.job.result.run.id).toMatch(/^run_/);
    } finally {
      delete process.env.PROJECT_AUTOPSY_RUN_DB_PATH;
      clearAnalysisJobs();
    }
  });

  test("rejects local filesystem paths when local inspection is disabled", async () => {
    delete process.env.PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS;

    try {
      const response = await POST(
        jsonRequest("http://localhost/api/repositories/inspect", {
          source: fixturePath
        })
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("only inspects public github.com URLs");
    } finally {
      process.env.PROJECT_AUTOPSY_ALLOW_LOCAL_PATHS = "true";
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

  test("enforces inspect auth with missing, wrong, and correct credentials", async () => {
    process.env.PROJECT_AUTOPSY_INSPECT_TOKEN = "inspect-secret";

    try {
      const missing = await POST(
        jsonRequest("http://localhost/api/repositories/inspect", {
          source: fixturePath
        })
      );
      const wrong = await POST(
        jsonRequest(
          "http://localhost/api/repositories/inspect",
          {
            source: fixturePath
          },
          {
            authorization: "Bearer wrong"
          }
        )
      );
      const correct = await POST(
        jsonRequest(
          "http://localhost/api/repositories/inspect",
          {
            branch: "main"
          },
          {
            authorization: "Bearer inspect-secret"
          }
        )
      );

      expect(missing.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(correct.status).toBe(400);
      expect(correct.headers.get("cache-control")).toBe("private, no-store");
    } finally {
      delete process.env.PROJECT_AUTOPSY_INSPECT_TOKEN;
    }
  });

  test("protects saved-run and job APIs with missing, wrong, and correct inspect credentials", async () => {
    process.env.PROJECT_AUTOPSY_INSPECT_TOKEN = "inspect-secret";

    const routes = [
      {
        name: "job status",
        call: (headers: HeadersInit = {}) =>
          getJob(new Request("http://localhost/api/jobs/job_missing", { headers }), {
            params: Promise.resolve({ id: "job_missing" })
          })
      },
      {
        name: "saved run JSON",
        call: (headers: HeadersInit = {}) =>
          getRun(new Request("http://localhost/api/runs/run_missing", { headers }), {
            params: Promise.resolve({ id: "run_missing" })
          })
      },
      {
        name: "saved run Markdown",
        call: (headers: HeadersInit = {}) =>
          exportMarkdown(new Request("http://localhost/api/runs/run_missing/export.md", { headers }), {
            params: Promise.resolve({ id: "run_missing" })
          })
      }
    ];

    try {
      for (const route of routes) {
        const missing = await route.call();
        const wrong = await route.call({ authorization: "Bearer wrong" });
        const correct = await route.call({ authorization: "Bearer inspect-secret" });

        expect.soft(missing.status, route.name).toBe(401);
        expect.soft(wrong.status, route.name).toBe(401);
        expect.soft(correct.status, route.name).toBe(404);
        expect.soft(correct.headers.get("cache-control"), route.name).toBe("private, no-store");
      }
    } finally {
      delete process.env.PROJECT_AUTOPSY_INSPECT_TOKEN;
    }
  });

  test("returns JSON errors for invalid GitHub App configuration", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_APP_ID = "123";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID = "456";
    process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY = "not-a-private-key";
    process.env.PROJECT_AUTOPSY_INSPECT_TOKEN = "inspect-secret";

    try {
      const response = await POST(
        jsonRequest(
          "http://localhost/api/repositories/inspect",
          {
            source: fixturePath
          },
          {
            authorization: "Bearer inspect-secret"
          }
        )
      );
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toMatch(/DECODER|PEM|unsupported/i);
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_INSTALLATION_ID;
      delete process.env.PROJECT_AUTOPSY_GITHUB_APP_PRIVATE_KEY;
      delete process.env.PROJECT_AUTOPSY_INSPECT_TOKEN;
    }
  });

  test("requires inspect authentication before using configured private credentials", async () => {
    process.env.PROJECT_AUTOPSY_GITHUB_TOKEN = "github-token";

    try {
      const response = await POST(
        jsonRequest("http://localhost/api/repositories/inspect", {
          source: fixturePath
        })
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toContain("PROJECT_AUTOPSY_INSPECT_TOKEN");
    } finally {
      delete process.env.PROJECT_AUTOPSY_GITHUB_TOKEN;
    }
  });
});

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}
