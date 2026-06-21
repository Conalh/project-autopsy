import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AnalysisRunStore,
  AutopsyReport,
  SavedAnalysisRunSummary,
  SourceType,
  VerdictStatus
} from "../types.js";
import { createExternalAutopsyReport } from "../report/external.js";
import { renderJsonReport } from "../report/json.js";
import { renderMarkdownReport } from "../report/markdown.js";

interface RunRow {
  id: string;
  source: string;
  source_type: SourceType;
  project_name: string;
  score: number;
  verdict_status: VerdictStatus;
  created_at: string;
  report_json: string;
  markdown: string;
}

export function defaultRunStorePath(cwd = process.cwd()): string {
  return path.join(cwd, ".project-autopsy", "runs.sqlite");
}

export function createSqliteRunStore(dbPath = defaultRunStorePath()): AnalysisRunStore {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      project_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      verdict_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      report_json TEXT NOT NULL,
      markdown TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_created_at
      ON analysis_runs(created_at DESC);
  `);

  return {
    saveRun(input) {
      const id = `run_${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const report = createExternalAutopsyReport(input.report);
      const markdown = renderMarkdownReport(report);
      const json = renderJsonReport(report);
      const reportJson = JSON.stringify(report);

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
          id,
          input.source,
          report.summary.sourceType,
          report.summary.projectName,
          report.verdict.score,
          report.verdict.status,
          createdAt,
          reportJson,
          markdown
        );

      return {
        id,
        source: input.source,
        sourceType: report.summary.sourceType,
        projectName: report.summary.projectName,
        score: report.verdict.score,
        verdictStatus: report.verdict.status,
        createdAt,
        report,
        markdown,
        json
      };
    },

    listRuns(limit = 20) {
      const rows = database
        .prepare(
          `SELECT
            id,
            source,
            source_type,
            project_name,
            score,
            verdict_status,
            created_at
          FROM analysis_runs
          ORDER BY created_at DESC
          LIMIT ?`
        )
        .all(limit) as Omit<RunRow, "report_json" | "markdown">[];

      return rows.map(toSummary);
    },

    getRun(id) {
      const row = database
        .prepare(
          `SELECT
            id,
            source,
            source_type,
            project_name,
            score,
            verdict_status,
            created_at,
            report_json,
            markdown
          FROM analysis_runs
          WHERE id = ?`
        )
        .get(id) as RunRow | undefined;

      if (!row) {
        return undefined;
      }

      const report = createExternalAutopsyReport(JSON.parse(row.report_json) as AutopsyReport);
      const markdown = renderMarkdownReport(report);
      const json = renderJsonReport(report);
      const reportJson = JSON.stringify(report);

      if (row.report_json !== reportJson || row.markdown !== markdown) {
        database
          .prepare(
            `UPDATE analysis_runs
            SET
              source_type = ?,
              project_name = ?,
              score = ?,
              verdict_status = ?,
              report_json = ?,
              markdown = ?
            WHERE id = ?`
          )
          .run(
            report.summary.sourceType,
            report.summary.projectName,
            report.verdict.score,
            report.verdict.status,
            reportJson,
            markdown,
            row.id
          );
      }

      return {
        ...toSummary({
          ...row,
          source_type: report.summary.sourceType,
          project_name: report.summary.projectName,
          score: report.verdict.score,
          verdict_status: report.verdict.status
        }),
        report,
        markdown,
        json
      };
    }
  };
}

function toSummary(row: Omit<RunRow, "report_json" | "markdown">): SavedAnalysisRunSummary {
  return {
    id: row.id,
    source: row.source,
    sourceType: row.source_type,
    projectName: row.project_name,
    score: row.score,
    verdictStatus: row.verdict_status,
    createdAt: row.created_at
  };
}
