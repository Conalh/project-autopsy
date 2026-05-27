export { inspectLocalRepository } from "./ingest/local.js";
export {
  inspectGitHubRepository,
  isGitHubUrl,
  parseGitHubUrl,
  type GitHubInspectionOptions,
  type GitHubRepositoryInput,
  type ParsedGitHubUrl
} from "./ingest/github.js";
export { analyzeRepository } from "./report/autopsy-report.js";
export { renderJsonReport } from "./report/json.js";
export { renderMarkdownReport } from "./report/markdown.js";
export type {
  AutopsyReport,
  CommitSummary,
  Confidence,
  DocRecord,
  Evidence,
  FileKind,
  FileRecord,
  Finding,
  ManifestManager,
  ManifestRecord,
  RepoSnapshot,
  ReportMetadata,
  ReportSummary,
  ReportVerdict,
  RevivalTask,
  Severity,
  SourceType,
  StallHypothesis
} from "./types.js";
