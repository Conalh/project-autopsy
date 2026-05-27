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
}

export type Severity = "info" | "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";

export interface Evidence {
  kind: "file" | "commit" | "manifest" | "docs";
  path?: string;
  lineNumber?: number;
  commitSha?: string;
  excerpt: string;
}

export interface Finding {
  kind: string;
  severity: Severity;
  title: string;
  body: string;
  evidence: Evidence[];
}

export interface StallHypothesis {
  rank: number;
  title: string;
  confidence: Confidence;
  rationale: string;
  supportingFindingKinds: string[];
}

export interface RevivalTask {
  phase: string;
  title: string;
  rationale: string;
  files: string[];
  verificationCommand: string;
  expectedResult: string;
  priority: number;
}

export interface AutopsyReport {
  snapshot: RepoSnapshot;
  findings: Finding[];
  stallHypotheses: StallHypothesis[];
  revivalTasks: RevivalTask[];
}
