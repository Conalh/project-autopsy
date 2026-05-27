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
      const reportJson = JSON.stringify(input.report);

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
          input.report.summary.sourceType,
          input.report.summary.projectName,
          input.report.verdict.score,
          input.report.verdict.status,
          createdAt,
          reportJson,
          input.markdown
        );

      return {
        id,
        source: input.source,
        sourceType: input.report.summary.sourceType,
        projectName: input.report.summary.projectName,
        score: input.report.verdict.score,
        verdictStatus: input.report.verdict.status,
        createdAt,
        report: input.report,
        markdown: input.markdown,
        json: `${reportJson}\n`
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

      return {
        ...toSummary(row),
        report: JSON.parse(row.report_json) as AutopsyReport,
        markdown: row.markdown,
        json: `${row.report_json}\n`
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
