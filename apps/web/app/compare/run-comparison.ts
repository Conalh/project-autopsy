import type { SavedAnalysisRun } from "@project-autopsy/core";

const severityOrder = ["high", "medium", "low", "info"] as const;

type SeverityKey = (typeof severityOrder)[number];
type FindingCounts = SavedAnalysisRun["report"]["summary"]["findingCounts"];
type VerdictStatus = SavedAnalysisRun["verdictStatus"];

interface ComparedRun {
  id: string;
  projectName: string;
  createdAt: string;
  score: number;
  verdictStatus: VerdictStatus;
}

export interface RunComparison {
  left: ComparedRun;
  right: ComparedRun;
  scoreDelta: number;
  fileDelta: number;
  taskDelta: number;
  findingDeltas: FindingCounts;
  addedFindingKinds: string[];
  resolvedFindingKinds: string[];
  sharedFindingKinds: string[];
}

export function buildRunComparison(left: SavedAnalysisRun, right: SavedAnalysisRun): RunComparison {
  const leftKinds = new Set(left.report.findings.map((finding) => finding.kind));
  const rightKinds = new Set(right.report.findings.map((finding) => finding.kind));

  return {
    left: summarizeRun(left),
    right: summarizeRun(right),
    scoreDelta: right.score - left.score,
    fileDelta: right.report.summary.fileCount - left.report.summary.fileCount,
    taskDelta: right.report.revivalTasks.length - left.report.revivalTasks.length,
    findingDeltas: buildFindingDeltas(left.report.summary.findingCounts, right.report.summary.findingCounts),
    addedFindingKinds: sortedDifference(rightKinds, leftKinds),
    resolvedFindingKinds: sortedDifference(leftKinds, rightKinds),
    sharedFindingKinds: sortedIntersection(leftKinds, rightKinds)
  };
}

function summarizeRun(run: SavedAnalysisRun): ComparedRun {
  return {
    id: run.id,
    projectName: run.projectName,
    createdAt: run.createdAt,
    score: run.score,
    verdictStatus: run.verdictStatus
  };
}

function buildFindingDeltas(left: FindingCounts, right: FindingCounts): FindingCounts {
  return severityOrder.reduce(
    (deltas, severity) => ({
      ...deltas,
      [severity]: right[severity] - left[severity]
    }),
    {} as Record<SeverityKey, number>
  );
}

function sortedDifference(source: Set<string>, exclude: Set<string>): string[] {
  return [...source].filter((kind) => !exclude.has(kind)).sort();
}

function sortedIntersection(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((kind) => right.has(kind)).sort();
}
