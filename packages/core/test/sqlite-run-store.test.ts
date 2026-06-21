import { DatabaseSync } from "node:sqlite";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createSqliteRunStore, renderJsonReport, renderMarkdownReport, type AutopsyReport } from "../src/index.js";

describe("SQLite run store", () => {
  test("sanitizes saved reports before persistence", async () => {
    const dbPath = await createDbPath();
    const store = createSqliteRunStore(dbPath);
    const report = createRawReport("SQLite Fixture", 80);

    const saved = store.saveRun({
      source: "https://github.com/acme/sqlite-fixture",
      report,
      markdown: renderMarkdownReport(report),
      json: renderJsonReport(report)
    });

    const database = new DatabaseSync(dbPath);
    const row = database.prepare("SELECT report_json FROM analysis_runs WHERE id = ?").get(saved.id) as
      | { report_json: string }
      | undefined;
    database.close();

    expect(saved.report.snapshot.files).toEqual([]);
    expect(saved.report.snapshot.completeness).toEqual(report.snapshot.completeness);
    expect(saved.report.snapshot.docs[0]?.content).toBe("");
    expect(row?.report_json).not.toContain("Private docs");
  });

  test("sanitizes and rewrites legacy full-snapshot rows on read", async () => {
    const dbPath = await createDbPath();
    const store = createSqliteRunStore(dbPath);
    const report = createRawReport("Legacy SQLite Fixture", 70);
    const database = new DatabaseSync(dbPath);
    database
      .prepare(
        `INSERT INTO analysis_runs (
          id,
          source,
          source_type,
          project_name,
          score,
          verdict_status,
          created_at,
          report_json,
          markdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "run_legacy",
        "https://github.com/acme/legacy-sqlite-fixture",
        "github_url",
        "Legacy SQLite Fixture",
        70,
        "needs-cleanup",
        "2026-05-26T00:00:00.000Z",
        JSON.stringify(report),
        "legacy markdown with private roadmap"
      );

    const loaded = store.getRun("run_legacy");
    const row = database.prepare("SELECT report_json, markdown FROM analysis_runs WHERE id = ?").get("run_legacy") as
      | { report_json: string; markdown: string }
      | undefined;
    database.close();

    expect(loaded?.report.snapshot.files).toEqual([]);
    expect(loaded?.report.snapshot.completeness).toEqual(report.snapshot.completeness);
    expect(loaded?.report.snapshot.docs).toEqual([{ path: "README.md", title: "Secret Project", content: "" }]);
    expect(loaded?.report.snapshot.manifests[0]?.parsed).toEqual({});
    expect(loaded?.report.snapshot.commits[0]?.message).toBe("");
    expect(row?.report_json).not.toContain("Private docs");
    expect(row?.markdown).toBe(loaded?.markdown);
  });
});

async function createDbPath(): Promise<string> {
  return path.join(await mkdtemp(path.join(tmpdir(), "project-autopsy-sqlite-store-")), "runs.sqlite");
}

function createRawReport(projectName: string, score: number): AutopsyReport {
  return {
    metadata: {
      analyzerVersion: "0.1.0",
      reportSchemaVersion: "1.0",
      source: "github_url",
      generatedAt: "2026-05-26T00:00:00.000Z"
    },
    verdict: {
      score,
      status: "needs-cleanup",
      summary: "Fixture needs cleanup."
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
      rootPath: "https://github.com/acme/sqlite-fixture",
      owner: "acme",
      repo: "sqlite-fixture",
      url: "https://github.com/acme/sqlite-fixture",
      defaultBranch: "main",
      fileCount: 1,
      totalSizeBytes: 100,
      languages: {
        ts: 1
      },
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
      ],
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
