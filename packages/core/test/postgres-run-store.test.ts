import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  analyzeAndSaveRepository,
  createPostgresRunStore,
  migratePostgresRunStore,
  renderJsonReport,
  renderMarkdownReport,
  type AutopsyReport
} from "../src/index.js";

describe("Postgres run store", () => {
  test("can be used by the shared analyze-and-save helper", async () => {
    const client = new FakePostgresClient();
    const store = createPostgresRunStore(client);

    const saved = await analyzeAndSaveRepository("../../fixtures/stalled-npm-app", { store });

    expect(saved.projectName).toBe("Stalled Notes App");
    expect(await store.getRun(saved.id)).toMatchObject({
      id: saved.id,
      projectName: "Stalled Notes App"
    });
  });

  test("saves, lists, and loads analysis runs through a query client", async () => {
    const client = new FakePostgresClient();
    const store = createPostgresRunStore(client);
    const report = createReport("Hosted Fixture", 82);
    const markdown = renderMarkdownReport(report);

    const saved = await store.saveRun({
      source: "https://github.com/acme/hosted-fixture",
      report,
      markdown,
      json: renderJsonReport(report)
    });
    const runs = await store.listRuns();
    const loaded = await store.getRun(saved.id);

    expect(saved.id).toMatch(/^run_/);
    expect(runs).toEqual([
      expect.objectContaining({
        id: saved.id,
        source: "https://github.com/acme/hosted-fixture",
        sourceType: "github_url",
        projectName: "Hosted Fixture",
        score: 82,
        verdictStatus: "stable"
      })
    ]);
    expect(loaded?.markdown).toBe(markdown);
    expect(loaded?.json).toBe(renderJsonReport(report));
    expect(loaded?.report.summary.projectName).toBe("Hosted Fixture");
    expect(loaded?.report.snapshot.completeness).toEqual(report.snapshot.completeness);
  });

  test("sanitizes and rewrites legacy full-snapshot rows on read", async () => {
    const client = new FakePostgresClient();
    const store = createPostgresRunStore(client);
    const report = createRawReport("Legacy Hosted Fixture", 74);
    client.rows.push({
      id: "run_legacy",
      source: "https://github.com/acme/legacy-hosted-fixture",
      source_type: "github_url",
      project_name: "Legacy Hosted Fixture",
      score: 74,
      verdict_status: "needs-cleanup",
      created_at: "2026-05-26T00:00:00.000Z",
      report_json: JSON.stringify(report),
      markdown: "legacy markdown with private roadmap"
    });

    const loaded = await store.getRun("run_legacy");
    const persisted = client.rows.find((row) => row.id === "run_legacy");

    expect(loaded?.report.snapshot.files).toEqual([]);
    expect(loaded?.report.snapshot.completeness).toEqual(report.snapshot.completeness);
    expect(loaded?.report.snapshot.docs).toEqual([{ path: "README.md", title: "Secret Project", content: "" }]);
    expect(loaded?.report.snapshot.manifests[0]?.parsed).toEqual({});
    expect(loaded?.report.snapshot.commits[0]?.message).toBe("");
    expect(persisted?.report_json).not.toContain("Private docs");
    expect(persisted?.markdown).toBe(loaded?.markdown);
  });

  test("runs the hosted store schema migration", async () => {
    const client = new FakePostgresClient();

    await migratePostgresRunStore(client);

    expect(client.queries[0]?.text).toContain("CREATE TABLE IF NOT EXISTS analysis_runs");
    expect(client.queries[0]?.text).toContain("CREATE INDEX IF NOT EXISTS idx_analysis_runs_created_at");
  });
});

interface QueryResult<Row> {
  rows: Row[];
}

class FakePostgresClient {
  readonly rows: Array<Record<string, unknown>> = [];
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = [];

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<Row>> {
    this.queries.push({ text, values });

    if (text.includes("INSERT INTO analysis_runs")) {
      this.rows.push({
        id: values[0],
        source: values[1],
        source_type: values[2],
        project_name: values[3],
        score: values[4],
        verdict_status: values[5],
        created_at: values[6],
        report_json: values[7],
        markdown: values[8]
      });
      return { rows: [] };
    }

    if (text.includes("UPDATE analysis_runs")) {
      const row = this.rows.find((candidate) => candidate.id === values[0]);
      if (row) {
        row.source_type = values[1];
        row.project_name = values[2];
        row.score = values[3];
        row.verdict_status = values[4];
        row.report_json = values[5];
        row.markdown = values[6];
      }
      return { rows: [] };
    }

    if (text.includes("WHERE id = $1")) {
      return { rows: this.rows.filter((row) => row.id === values[0]) as Row[] };
    }

    if (text.includes("ORDER BY created_at DESC")) {
      return {
        rows: [...this.rows]
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .slice(0, Number(values[0])) as Row[]
      };
    }

    return { rows: [] };
  }
}

function createReport(projectName: string, score: number): AutopsyReport {
  return {
    metadata: {
      analyzerVersion: "0.1.0",
      reportSchemaVersion: "1.0",
      source: "github_url",
      generatedAt: "2026-05-26T00:00:00.000Z"
    },
    verdict: {
      score,
      status: "stable",
      summary: "Hosted fixture is stable."
    },
    summary: {
      projectName,
      sourceType: "github_url",
      fileCount: 1,
      technologies: ["typescript"],
      findingCounts: {
        info: 0,
        low: 0,
        medium: 0,
        high: 0
      }
    },
    snapshot: {
      sourceType: "github_url",
      rootPath: "https://github.com/acme/hosted-fixture",
      owner: "acme",
      repo: `hosted-${randomUUID()}`,
      url: "https://github.com/acme/hosted-fixture",
      defaultBranch: "main",
      fileCount: 1,
      totalSizeBytes: 100,
      languages: {
        ts: 1
      },
      files: [],
      manifests: [],
      docs: [],
      commits: [],
      summary: {
        projectName,
        technologies: ["typescript"]
      },
      completeness: completeFixtureCompleteness()
    },
    findings: [],
    stallHypotheses: [],
    revivalTasks: [],
    evidenceIndex: {}
  };
}

function completeFixtureCompleteness(): AutopsyReport["snapshot"]["completeness"] {
  return {
    files: { status: "partial", discovered: 1, included: 1, skipped: 1, reasons: ["file-count-limit"] },
    manifests: { status: "complete", discovered: 1, read: 1, skipped: 0, oversized: 0, failed: 0, reasons: [] },
    docs: { status: "complete", discovered: 1, read: 1, skipped: 0, oversized: 0, failed: 0, reasons: [] },
    commits: { status: "complete", requested: 20, read: 1, skipped: 0, reasons: [] },
    http: { status: "complete", requestsMade: 4, responsesTooLarge: 0, failures: 0, limitReached: false, reasons: [] },
    runtime: { status: "complete", elapsedMs: 0, limitMs: 60000, timedOut: false, reasons: [] }
  };
}

function createRawReport(projectName: string, score: number): AutopsyReport {
  return {
    ...createReport(projectName, score),
    snapshot: {
      ...createReport(projectName, score).snapshot,
      files: [{ path: "src/secret.ts", extension: ".ts", sizeBytes: 100, kind: "source" }],
      manifests: [
        {
          path: "package.json",
          manager: "npm",
          parsed: { name: "secret-project", private: true },
          scripts: { test: "vitest run" },
          dependencies: {},
          devDependencies: {}
        }
      ],
      docs: [{ path: "README.md", title: "Secret Project", content: "Private docs and roadmap." }],
      commits: [
        {
          sha: "abc123",
          authorName: "Private Author",
          committedAt: "2026-05-26T00:00:00.000Z",
          message: "Private roadmap"
        }
      ]
    }
  };
}
