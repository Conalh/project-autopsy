import { randomUUID } from "node:crypto";
import type {
  AsyncAnalysisRunStore,
  AutopsyReport,
  SavedAnalysisRunSummary,
  SourceType,
  VerdictStatus
} from "../types.js";

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
      const reportJson = JSON.stringify(input.report);

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
          input.report.summary.sourceType,
          input.report.summary.projectName,
          input.report.verdict.score,
          input.report.verdict.status,
          createdAt,
          reportJson,
          input.markdown
        ]
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

      const reportJson = typeof row.report_json === "string" ? row.report_json : JSON.stringify(row.report_json);

      return {
        ...toSummary(row),
        report: JSON.parse(reportJson) as AutopsyReport,
        markdown: row.markdown,
        json: `${reportJson}\n`
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
