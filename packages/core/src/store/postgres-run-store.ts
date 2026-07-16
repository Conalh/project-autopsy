import { randomUUID } from "node:crypto";
import type {
  AsyncAnalysisRunStore,
  AutopsyReport,
  SavedAnalysisRunSummary,
  SourceType,
  VerdictStatus
} from "../types.js";
import { createExternalAutopsyReport } from "../report/external.js";
import { renderJsonReport } from "../report/json.js";
import { renderMarkdownReport } from "../report/markdown.js";

export interface PostgresQueryClient {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: Row[] }>;
}

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

export const POSTGRES_RUN_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL,
  project_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  report_json JSONB NOT NULL,
  markdown TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_created_at
  ON analysis_runs(created_at DESC);
`;

export async function migratePostgresRunStore(client: PostgresQueryClient): Promise<void> {
  await client.query(POSTGRES_RUN_STORE_SCHEMA);
}

export function createPostgresRunStore(client: PostgresQueryClient): AsyncAnalysisRunStore {
  return {
    async saveRun(input) {
      const id = `run_${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const report = createExternalAutopsyReport(input.report);
      const markdown = renderMarkdownReport(report);
      const json = renderJsonReport(report);
      const reportJson = JSON.stringify(report);

      await client.query(
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
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          id,
          input.source,
          report.summary.sourceType,
          report.summary.projectName,
          report.verdict.score,
          report.verdict.status,
          createdAt,
          reportJson,
          markdown
        ]
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

    async listRuns(limit = 20) {
      const result = await client.query<Omit<RunRow, "report_json" | "markdown">>(
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
        LIMIT $1`,
        [limit]
      );

      return result.rows.map(toSummary);
    },

    async getRun(id) {
      const result = await client.query<RunRow>(
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
        WHERE id = $1`,
        [id]
      );
      const row = result.rows[0];
      if (!row) {
        return undefined;
      }

      const storedReportJson = typeof row.report_json === "string" ? row.report_json : JSON.stringify(row.report_json);
      const report = createExternalAutopsyReport(JSON.parse(storedReportJson) as AutopsyReport);
      const markdown = renderMarkdownReport(report);
      const json = renderJsonReport(report);
      const reportJson = JSON.stringify(report);

      if (storedReportJson !== reportJson || row.markdown !== markdown) {
        await client.query(
          `UPDATE analysis_runs
          SET
            source_type = $2,
            project_name = $3,
            score = $4,
            verdict_status = $5,
            report_json = $6::jsonb,
            markdown = $7
          WHERE id = $1`,
          [
            row.id,
            report.summary.sourceType,
            report.summary.projectName,
            report.verdict.score,
            report.verdict.status,
            reportJson,
            markdown
          ]
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
