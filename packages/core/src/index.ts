export { inspectLocalRepository, type LocalInspectionOptions } from "./ingest/local.js";
export { DEFAULT_INGESTION_BUDGETS, resolveIngestionBudgets } from "./ingest/budgets.js";
export {
  inspectGitHubRepository,
  isGitHubUrl,
  parseGitHubUrl,
  type GitHubInspectionOptions,
  type GitHubRepositoryInput,
  type ParsedGitHubUrl
} from "./ingest/github.js";
export { analyzeRepository } from "./report/autopsy-report.js";
export { analyzeAndSaveRepository, type AnalyzeAndSaveOptions } from "./report/analyze-and-save.js";
export { createExternalAutopsyReport } from "./report/external.js";
export { renderJsonReport } from "./report/json.js";
export { renderMarkdownReport } from "./report/markdown.js";
export {
  createPostgresRunStore,
  migratePostgresRunStore,
  POSTGRES_RUN_STORE_SCHEMA,
  type PostgresQueryClient
} from "./store/postgres-run-store.js";
export { createSqliteRunStore, defaultRunStorePath } from "./store/sqlite-run-store.js";
export type {
  AnalysisRunStore,
  AsyncAnalysisRunStore,
  AutopsyReport,
  CommitSummary,
  CommitCompleteness,
  CompletenessStatus,
  Confidence,
  DocRecord,
  DocsCompleteness,
  Evidence,
  FileKind,
  FileRecord,
  FileInventoryCompleteness,
  Finding,
  HttpCompleteness,
  IngestionCompleteness,
  InspectionBudgetOverrides,
  InspectionBudgets,
  ManifestManager,
  ManifestCompleteness,
  ManifestRecord,
  RepoSnapshot,
  ReportMetadata,
  ReportSummary,
  ReportVerdict,
  RevivalTask,
  SavedAnalysisRun,
  SavedAnalysisRunSummary,
  SaveAnalysisRunInput,
  Severity,
  SourceType,
  StallHypothesis
} from "./types.js";
