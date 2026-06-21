import { describe, expect, test } from "vitest";
import type { AutopsyReport, Finding, SavedAnalysisRun } from "@project-autopsy/core";
import { buildFindingDeltaChartItems, buildRunComparison } from "./run-comparison";

type FindingCounts = AutopsyReport["summary"]["findingCounts"];

describe("run comparison", () => {
  test("computes score, summary, severity, and finding kind deltas", () => {
    const left = createRun({
      id: "run_old",
      score: 42,
      fileCount: 4,
      taskCount: 2,
      findingCounts: { high: 1, medium: 1, low: 0, info: 0 },
      findingKinds: ["setup-risk", "dependency-drift"],
      limitationReasons: ["github-tree-truncated"]
    });
    const right = createRun({
      id: "run_new",
      score: 68,
      fileCount: 5,
      taskCount: 3,
      findingCounts: { high: 0, medium: 1, low: 1, info: 0 },
      findingKinds: ["setup-risk", "validation-surface"]
    });

    expect(buildRunComparison(left, right)).toEqual({
      left: {
        id: "run_old",
        projectName: "Fixture run_old",
        createdAt: "2026-05-20T00:00:00.000Z",
        score: 42,
        verdictStatus: "needs-cleanup",
        analysisStatus: "partial",
        limitationReasons: ["github-tree-truncated"]
      },
      right: {
        id: "run_new",
        projectName: "Fixture run_new",
        createdAt: "2026-05-21T00:00:00.000Z",
        score: 68,
        verdictStatus: "needs-cleanup",
        analysisStatus: "complete",
        limitationReasons: []
      },
      scoreDelta: 26,
      fileDelta: 1,
      taskDelta: 1,
      findingDeltas: { high: -1, medium: 0, low: 1, info: 0 },
      addedFindingKinds: ["validation-surface"],
      resolvedFindingKinds: ["dependency-drift"],
      sharedFindingKinds: ["setup-risk"]
    });
  });

  test("builds finding delta chart rows against the largest absolute change", () => {
    expect(buildFindingDeltaChartItems({ high: -2, medium: 1, low: 0, info: 4 })).toEqual([
      { severity: "high", label: "High", value: -2, magnitudePercent: 50 },
      { severity: "medium", label: "Medium", value: 1, magnitudePercent: 25 },
      { severity: "low", label: "Low", value: 0, magnitudePercent: 0 },
      { severity: "info", label: "Info", value: 4, magnitudePercent: 100 }
    ]);
  });
});

function createRun({
  id,
  score,
  fileCount,
  taskCount,
  findingCounts,
  findingKinds,
  limitationReasons = []
}: {
  id: string;
  score: number;
  fileCount: number;
  taskCount: number;
  findingCounts: FindingCounts;
  findingKinds: string[];
  limitationReasons?: string[];
}): SavedAnalysisRun {
  const report: AutopsyReport = {
    metadata: {
      analyzerVersion: "0.1.0",
      reportSchemaVersion: "1.0",
      source: "local_path",
      generatedAt: "2026-05-20T00:00:00.000Z"
    },
    verdict: {
      score,
      status: "needs-cleanup",
      summary: "Fixture summary"
    },
    summary: {
      projectName: `Fixture ${id}`,
      sourceType: "local_path",
      fileCount,
      technologies: ["npm"],
      findingCounts
    },
    snapshot: {
      sourceType: "local_path",
      rootPath: "/tmp/fixture",
      fileCount,
      totalSizeBytes: 1200,
      languages: {},
      files: [],
      manifests: [],
      docs: [],
      commits: [],
      summary: {
        projectName: `Fixture ${id}`,
        technologies: ["npm"]
      },
      completeness: {
        files: {
          status: limitationReasons.length > 0 ? "partial" : "complete",
          discovered: fileCount,
          included: fileCount,
          skipped: limitationReasons.length,
          reasons: limitationReasons
        },
        manifests: { status: "complete", discovered: 0, read: 0, skipped: 0, oversized: 0, failed: 0, reasons: [] },
        docs: { status: "complete", discovered: 0, read: 0, skipped: 0, oversized: 0, failed: 0, reasons: [] },
        commits: { status: "complete", requested: 0, read: 0, skipped: 0, reasons: [] },
        runtime: { status: "complete", elapsedMs: 0, limitMs: 60000, timedOut: false, reasons: [] }
      }
    },
    findings: findingKinds.map((kind, index): Finding => {
      const severity = (Object.entries(findingCounts).find(([, count]) => count > index)?.[0] ?? "info") as Finding["severity"];
      return {
        id: `FINDING-${index + 1}`,
        kind,
        severity,
        title: kind,
        body: `${kind} body`,
        evidence: []
      };
    }),
    stallHypotheses: [],
    revivalTasks: Array.from({ length: taskCount }, (_, index) => ({
      id: `TASK-${index + 1}`,
      phase: "Phase 1",
      title: `Task ${index + 1}`,
      rationale: "Fixture task",
      files: [],
      verificationCommand: "npm test",
      expectedResult: "Tests pass",
      priority: index + 1
    })),
    evidenceIndex: {}
  };

  return {
    id,
    source: "/tmp/fixture",
    sourceType: "local_path",
    projectName: report.summary.projectName,
    score,
    verdictStatus: report.verdict.status,
    createdAt: id === "run_old" ? "2026-05-20T00:00:00.000Z" : "2026-05-21T00:00:00.000Z",
    report,
    markdown: "# Fixture",
    json: "{}"
  };
}
