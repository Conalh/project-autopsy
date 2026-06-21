import { describe, expect, test } from "vitest";
import { createExternalAutopsyReport, type AutopsyReport } from "../src/index.js";

describe("external report minimization", () => {
  test("removes raw analysis inputs while preserving report rollups", () => {
    const report = createReport();
    const external = createExternalAutopsyReport(report);

    expect(external.summary).toEqual(report.summary);
    expect(external.findings).toEqual(report.findings);
    expect(external.snapshot.completeness).toEqual(report.snapshot.completeness);
    expect(external.snapshot.files).toEqual([]);
    expect(external.snapshot.docs).toEqual([{ path: "README.md", title: "Secret Project", content: "" }]);
    expect(external.snapshot.manifests).toEqual([
      {
        path: "package.json",
        manager: "npm",
        parsed: {},
        scripts: { test: "vitest run" },
        dependencies: { next: "^16.0.0" },
        devDependencies: {}
      }
    ]);
    expect(external.snapshot.commits).toEqual([
      {
        sha: "abc123",
        committedAt: "2026-05-01T00:00:00.000Z",
        authorName: "",
        message: ""
      }
    ]);
  });

  test("adds deterministic legacy completeness when old reports lack the field", () => {
    const legacy = createReport() as AutopsyReport & { snapshot: Partial<AutopsyReport["snapshot"]> };
    delete legacy.snapshot.completeness;

    const external = createExternalAutopsyReport(legacy as AutopsyReport);

    expect(external.snapshot.completeness.files.status).toBe("partial");
    expect(external.snapshot.completeness.files.reasons).toEqual(["legacy-completeness-unavailable"]);
    expect(external.snapshot.completeness.runtime.elapsedMs).toBe(0);
  });
});

function createReport(): AutopsyReport {
  return {
    metadata: {
      analyzerVersion: "0.3.0",
      reportSchemaVersion: "1.0",
      source: "github_url",
      generatedAt: "2026-05-26T00:00:00.000Z"
    },
    verdict: {
      score: 82,
      status: "needs-cleanup",
      summary: "Report summary."
    },
    summary: {
      projectName: "Secret Project",
      sourceType: "github_url",
      fileCount: 2,
      technologies: ["TypeScript"],
      findingCounts: {
        info: 1,
        low: 0,
        medium: 0,
        high: 0
      }
    },
    snapshot: {
      sourceType: "github_url",
      rootPath: "https://github.com/acme/secret",
      owner: "acme",
      repo: "secret",
      url: "https://github.com/acme/secret",
      defaultBranch: "main",
      headSha: "abc123",
      fileCount: 2,
      totalSizeBytes: 100,
      languages: { TypeScript: 1 },
      files: [
        { path: "README.md", extension: ".md", sizeBytes: 50, kind: "docs" },
        { path: "src/index.ts", extension: ".ts", sizeBytes: 50, kind: "source" }
      ],
      manifests: [
        {
          path: "package.json",
          manager: "npm",
          parsed: { name: "secret", private: true },
          scripts: { test: "vitest run" },
          dependencies: { next: "^16.0.0" },
          devDependencies: {}
        }
      ],
      docs: [{ path: "README.md", title: "Secret Project", content: "# Secret Project\n\nPrivate docs." }],
      commits: [
        {
          sha: "abc123",
          committedAt: "2026-05-01T00:00:00.000Z",
          authorName: "Private Author",
          message: "private roadmap"
        }
      ],
      summary: {
        projectName: "Secret Project",
        claimedValue: "Private docs.",
        technologies: ["TypeScript"]
      },
      completeness: completeFixtureCompleteness()
    },
    findings: [
      {
        id: "FINDING-001",
        kind: "momentum-break",
        severity: "info",
        title: "Latest visible momentum",
        body: "The latest commit is visible.",
        evidence: [],
        evidenceIds: []
      }
    ],
    stallHypotheses: [],
    revivalTasks: [],
    evidenceIndex: {}
  };
}

function completeFixtureCompleteness(): AutopsyReport["snapshot"]["completeness"] {
  return {
    files: { status: "partial", discovered: 2, included: 2, skipped: 1, reasons: ["github-tree-truncated"] },
    manifests: { status: "complete", discovered: 1, read: 1, skipped: 0, oversized: 0, failed: 0, reasons: [] },
    docs: { status: "complete", discovered: 1, read: 1, skipped: 0, oversized: 0, failed: 0, reasons: [] },
    commits: { status: "complete", requested: 20, read: 1, skipped: 0, reasons: [] },
    http: { status: "complete", requestsMade: 4, responsesTooLarge: 0, failures: 0, limitReached: false, reasons: [] },
    runtime: { status: "complete", elapsedMs: 0, limitMs: 60000, timedOut: false, reasons: [] }
  };
}
