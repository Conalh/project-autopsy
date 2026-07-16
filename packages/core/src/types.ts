export type SourceType = "github_url" | "local_path";

export type FileKind =
  | "source"
  | "test"
  | "docs"
  | "config"
  | "workflow"
  | "asset"
  | "unknown";

export type ManifestManager =
  | "npm"
  | "python"
  | "rust"
  | "go"
  | "dotnet"
  | "docker"
  | "github_actions";

export interface FileRecord {
  path: string;
  extension: string;
  sizeBytes: number;
  kind: FileKind;
}

export interface ManifestRecord {
  path: string;
  manager: ManifestManager;
  parsed: Record<string, unknown>;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  /**
   * Set when the manifest could not be parsed. Dependencies/scripts are left
   * empty so downstream detectors degrade gracefully instead of crashing.
   */
  parseError?: string;
}

export interface DocRecord {
  path: string;
  title?: string;
  content: string;
}

export interface CommitSummary {
  sha: string;
  authorName: string;
  committedAt: string;
  message: string;
}

export interface SnapshotSummary {
  projectName: string;
  claimedValue?: string;
  technologies: string[];
}

export interface InspectionBudgets {
  maxFiles: number;
  maxDepth: number;
  maxTotalBytes: number;
  maxManifests: number;
  maxManifestBytes: number;
  maxDocs: number;
  maxDocBytes: number;
  maxTotalDocBytes: number;
  maxCommits: number;
  maxHttpRequests: number;
  maxResponseBytes: number;
  concurrency: number;
  registryConcurrency: number;
  maxRuntimeMs: number;
  fetchTimeoutMs: number;
}

export type InspectionBudgetOverrides = Partial<InspectionBudgets>;

export type CompletenessStatus = "complete" | "partial";

export interface FileInventoryCompleteness {
  status: CompletenessStatus;
  discovered: number;
  included: number;
  skipped: number;
  reasons: string[];
}

export interface ManifestCompleteness {
  status: CompletenessStatus;
  discovered: number;
  read: number;
  skipped: number;
  oversized: number;
  failed: number;
  reasons: string[];
}

export interface DocsCompleteness {
  status: CompletenessStatus;
  discovered: number;
  read: number;
  skipped: number;
  oversized: number;
  failed: number;
  reasons: string[];
}

export interface CommitCompleteness {
  status: CompletenessStatus;
  requested: number;
  read: number;
  skipped: number;
  reasons: string[];
}

export interface HttpCompleteness {
  status: CompletenessStatus;
  requestsMade: number;
  responsesTooLarge: number;
  failures: number;
  limitReached: boolean;
  reasons: string[];
}

export interface RuntimeCompleteness {
  status: CompletenessStatus;
  elapsedMs: number;
  limitMs: number;
  timedOut: boolean;
  reasons: string[];
}

export interface IngestionCompleteness {
  files: FileInventoryCompleteness;
  manifests: ManifestCompleteness;
  docs: DocsCompleteness;
  commits: CommitCompleteness;
  http?: HttpCompleteness;
  runtime: RuntimeCompleteness;
}

export interface RepoSnapshot {
  sourceType: SourceType;
  rootPath: string;
  owner?: string;
  repo?: string;
  url?: string;
  defaultBranch?: string;
  headSha?: string;
  fileCount: number;
  totalSizeBytes: number;
  languages: Record<string, number>;
  files: FileRecord[];
  manifests: ManifestRecord[];
  docs: DocRecord[];
  commits: CommitSummary[];
  summary: SnapshotSummary;
  completeness: IngestionCompleteness;
  /**
   * Non-fatal problems encountered while ingesting the repository (e.g. a
   * truncated GitHub tree or files skipped by size/count caps). Surfaced as
   * findings so a report never silently claims completeness it does not have.
   */
  ingestionWarnings?: string[];
}

export type Severity = "info" | "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";

export interface Evidence {
  id?: string;
  kind: "file" | "commit" | "manifest" | "docs";
  path?: string;
  lineNumber?: number;
  commitSha?: string;
  excerpt: string;
}

export interface Finding {
  id?: string;
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  evidence: Evidence[];
  evidenceIds?: string[];
}

export interface StallHypothesis {
  rank: number;
  title: string;
  confidence: Confidence;
  rationale: string;
  supportingFindingKinds: string[];
}

export interface RevivalTask {
  id?: string;
  phase: string;
  title: string;
  rationale: string;
  files: string[];
  verificationCommand: string;
  expectedResult: string;
  priority: number;
  evidenceIds?: string[];
}

export type VerdictStatus = "stable" | "needs-cleanup" | "at-risk";

export interface ReportVerdict {
  score: number;
  status: VerdictStatus;
  summary: string;
}

export interface FindingCounts {
  info: number;
  low: number;
  medium: number;
  high: number;
}

export interface ReportSummary {
  projectName: string;
  sourceType: SourceType;
  fileCount: number;
  technologies: string[];
  findingCounts: FindingCounts;
}

export interface ReportMetadata {
  analyzerVersion: string;
  reportSchemaVersion: string;
  source: SourceType;
  generatedAt: string;
}

export interface AutopsyReport {
  metadata: ReportMetadata;
  verdict: ReportVerdict;
  summary: ReportSummary;
  snapshot: RepoSnapshot;
  findings: Finding[];
  stallHypotheses: StallHypothesis[];
  revivalTasks: RevivalTask[];
  evidenceIndex: Record<string, Evidence>;
}

export interface SavedAnalysisRunSummary {
  id: string;
  source: string;
  sourceType: SourceType;
  projectName: string;
  score: number;
  verdictStatus: VerdictStatus;
  createdAt: string;
}

export interface SavedAnalysisRun extends SavedAnalysisRunSummary {
  report: AutopsyReport;
  markdown: string;
  json: string;
}

export interface SaveAnalysisRunInput {
  source: string;
  report: AutopsyReport;
  markdown: string;
  json: string;
}

export interface AnalysisRunStore {
  saveRun(input: SaveAnalysisRunInput): SavedAnalysisRun;
  listRuns(limit?: number): SavedAnalysisRunSummary[];
  getRun(id: string): SavedAnalysisRun | undefined;
}

export interface AsyncAnalysisRunStore {
  saveRun(input: SaveAnalysisRunInput): Promise<SavedAnalysisRun>;
  listRuns(limit?: number): Promise<SavedAnalysisRunSummary[]>;
  getRun(id: string): Promise<SavedAnalysisRun | undefined>;
}
