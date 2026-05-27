import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { renderJsonReport, renderMarkdownReport, type AutopsyReport } from "@project-autopsy/core";
import { createWebRunStore } from "./run-store";

describe("web run store selection", () => {
  test("uses SQLite when no Postgres URL is configured", async () => {
    const dbPath = path.join(await mkdtemp(path.join(tmpdir(), "project-autopsy-web-store-")), "runs.sqlite");
    const store = await createWebRunStore({
      env: {
        PROJECT_AUTOPSY_RUN_DB_PATH: dbPath
      }
    });
    const report = createReport("SQLite Web Store");

    const saved = await store.saveRun({
      source: "local-fixture",
      report,
      markdown: renderMarkdownReport(report),
      json: renderJsonReport(report)
    });

    expect((await store.getRun(saved.id))?.projectName).toBe("SQLite Web Store");
  });

  test("uses Postgres and migrates schema when a Postgres URL is configured", async () => {
    const client = new FakePostgresClient();
    const store = await createWebRunStore({
      env: {
        PROJECT_AUTOPSY_POSTGRES_URL: "postgres://example/project-autopsy"
      },
      postgresClient: client
    });
    const report = createReport("Postgres Web Store");

    const saved = await store.saveRun({
      source: "https://github.com/acme/postgres-web-store",
      report,
      markdown: renderMarkdownReport(report),
      json: renderJsonReport(report)
    });

    expect(client.queries[0]?.text).toContain("CREATE TABLE IF NOT EXISTS analysis_runs");
    expect((await store.getRun(saved.id))?.projectName).toBe("Postgres Web Store");
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

    if (text.includes("WHERE id = $1")) {
      return { rows: this.rows.filter((row) => row.id === values[0]) as Row[] };
    }

    if (text.includes("ORDER BY created_at DESC")) {
      return { rows: this.rows as Row[] };
    }

    return { rows: [] };
  }
}

function createReport(projectName: string): AutopsyReport {
  return {
    metadata: {
      analyzerVersion: "0.1.0",
      reportSchemaVersion: "1.0",
      source: "github_url",
      generatedAt: "2026-05-26T00:00:00.000Z"
    },
    verdict: {
      score: 91,
      status: "stable",
      summary: "Fixture is stable."
    },
    summary: {
      projectName,
      sourceType: "github_url",
      fileCount: 1,
      technologies: [],
      findingCounts: {
        info: 0,
        low: 0,
        medium: 0,
        high: 0
      }
    },
    snapshot: {
      sourceType: "github_url",
      rootPath: "https://github.com/acme/postgres-web-store",
      fileCount: 1,
      totalSizeBytes: 1,
      languages: {},
      files: [],
      manifests: [],
      docs: [],
      commits: [],
      summary: {
        projectName,
        technologies: []
      }
    },
    findings: [],
    stallHypotheses: [],
    revivalTasks: [],
    evidenceIndex: {}
  };
}
