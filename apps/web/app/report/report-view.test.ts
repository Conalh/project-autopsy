import { describe, expect, test } from "vitest";
import type { AutopsyReport } from "@project-autopsy/core";
import { buildReportNavigation } from "./report-navigation";
import { buildSeverityChartItems } from "./report-charts";
import { buildDependencySummary, buildTimelineItems } from "./report-summary";

const baseReport: AutopsyReport = {
  metadata: {
    analyzerVersion: "0.1.0",
    reportSchemaVersion: "1.0",
    source: "local_path",
    generatedAt: "2026-05-26T00:00:00.000Z"
  },
  verdict: {
    score: 42,
    status: "needs-cleanup",
    summary: "Fixture summary"
  },
  summary: {
    projectName: "Fixture",
    sourceType: "local_path",
    fileCount: 4,
    technologies: ["npm"],
    findingCounts: {
      info: 0,
      low: 0,
      medium: 1,
      high: 0
    }
  },
  snapshot: {
    sourceType: "local_path",
    rootPath: "/tmp/fixture",
    fileCount: 4,
    totalSizeBytes: 1200,
    languages: {},
    files: [],
    manifests: [
      {
        path: "package.json",
        manager: "npm",
        parsed: {},
        scripts: {
          build: "tsc",
          test: "vitest run"
        },
        dependencies: {
          next: "^12.0.0",
          react: "^17.0.0"
        },
        devDependencies: {
          vitest: "^1.0.0"
        }
      }
    ],
    docs: [],
    commits: [
      {
        sha: "abc1234567890",
        authorName: "Casey Dev",
        committedAt: "2026-05-20T10:30:00.000Z",
        message: "restore report view"
      }
    ],
    summary: {
      projectName: "Fixture",
      technologies: ["npm"]
    }
  },
  findings: [
    {
      id: "FINDING-001",
      kind: "dependency-drift",
      severity: "medium",
      title: "npm dependency is behind the latest major: next",
      body: "next is behind.",
      evidence: []
    }
  ],
  stallHypotheses: [],
  revivalTasks: [],
  evidenceIndex: {}
};

describe("report view summaries", () => {
  test("builds timeline items from commit evidence", () => {
    expect(buildTimelineItems(baseReport)).toEqual([
      {
        key: "abc1234567890",
        date: "2026-05-20",
        title: "restore report view",
        detail: "Casey Dev - abc1234"
      }
    ]);
  });

  test("builds dependency rollups across manifests and drift findings", () => {
    expect(buildDependencySummary(baseReport)).toEqual({
      manifestCount: 1,
      managerLabels: "npm",
      dependencyCount: 2,
      devDependencyCount: 1,
      scriptCount: 2,
      driftFindingCount: 1
    });
  });

  test("builds report navigation labels with section counts", () => {
    expect(buildReportNavigation(baseReport).map((item) => `${item.label}:${item.href}`)).toEqual([
      "Verdict:#verdict",
      "Timeline 1:#timeline",
      "Findings 1:#findings",
      "Revival Plan 0:#revival-plan",
      "Dependencies 1:#dependencies",
      "Evidence 0:#evidence"
    ]);
  });

  test("builds severity chart rows with stable ordering and percentages", () => {
    expect(
      buildSeverityChartItems({
        ...baseReport,
        summary: {
          ...baseReport.summary,
          findingCounts: {
            high: 1,
            medium: 2,
            low: 1,
            info: 0
          }
        }
      })
    ).toEqual([
      { severity: "high", label: "High", count: 1, percent: 25 },
      { severity: "medium", label: "Medium", count: 2, percent: 50 },
      { severity: "low", label: "Low", count: 1, percent: 25 },
      { severity: "info", label: "Info", count: 0, percent: 0 }
    ]);
  });
});
